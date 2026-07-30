from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from services.supabase_client import get_current_user_id, upsert_user_profile, get_user_profile
from services.groq_service import call_groq_json, call_groq_stream
from db.mongo_client import get_mongo_db, get_projects_collection
from models.project import Project, RoadmapStep, CodeFile
from services.github_deploy_service import (
    create_github_repo,
    push_files_to_repo,
    _get_authenticated_user,
    _slugify,
)
from services.vercel_deploy_service import deploy_to_vercel
from services.linkedin_service import generate_linkedin_post
import json
import asyncio
import uuid as uuid_lib
import math
import re
from datetime import datetime, timezone

router = APIRouter()



def serialize_project(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serializable dict."""
    doc["_id"] = str(doc["_id"])
    return doc


class InitStudioRequest(BaseModel):
    project_title: str
    project_brief: str
    tech_stack: list[str]
    difficulty: str
    user_level: str


class SaveCodeRequest(BaseModel):
    project_id: str
    filename: str
    content: str


class CreateFileRequest(BaseModel):
    project_id: str
    filename: str
    content: str = ""          # Optional starter content


class DeleteFileRequest(BaseModel):
    project_id: str
    filename: str


class RenameFileRequest(BaseModel):
    project_id: str
    old_filename: str
    new_filename: str


class CompleteStepRequest(BaseModel):
    project_id: str
    step_id: str


class CopilotMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class CopilotRequest(BaseModel):
    project_id: str
    messages: list[CopilotMessage]          # Current session messages (from frontend store)
    current_code: str
    current_step_title: str
    current_step_instructions: str
    all_filenames: list[str] = []           # All open file names (for context)
    quick_action: str | None = None         # "debug" | "explain" | "optimize" | "next_hint"


@router.post("/init")
async def init_studio(
    request: InitStudioRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Called when user selects a project from the results page.
    Generates the adaptive roadmap with Groq and saves the project to MongoDB.
    Returns the project_id and full project object.
    """
    try:
        # Build level-specific instruction guidance
        if request.user_level == "Beginner":
            instruction_style = """
For each step, instructions must include:
1. A "What you'll build" section (2 sentences)
2. A "Why this matters" section (1-2 sentences)
3. A numbered "Step-by-step tasks" section with 4-6 sub-tasks (start with action verbs: Create, Add, Import, Write, Run)
4. A short code example showing the PATTERN (not the full solution) — e.g. the function signature or import structure
5. A "Common mistakes" section with 2-3 bullet points
6. A "You'll know this works when..." section describing expected output
Instructions should be very detailed. Minimum 250 words per step."""

        elif request.user_level == "Advanced":
            instruction_style = """
For each step, instructions must include:
1. A "Implement" section: a bullet list of 4-6 features/behaviors this step must have
2. A "Approach" section: one sentence describing the recommended pattern
3. No code examples. No sub-task breakdown. No common mistakes section.
Instructions should be concise. Maximum 100 words per step."""

        else:  # Intermediate
            instruction_style = """
For each step, instructions must include:
1. A "What to build" section (2-3 sentences)
2. A "Key concepts" section with 2-3 bullet points explaining what to learn
3. A "Hints" section with 2-3 starting points (not full solutions)
4. A "You'll know this works when..." section
Instructions should be moderately detailed. 120-180 words per step."""

        prompt = f"""You are a coding mentor creating a step-by-step project guide.

Project: {request.project_title}
Description: {request.project_brief}
Tech Stack: {', '.join(request.tech_stack)}
Student Level: {request.user_level}
Difficulty: {request.difficulty}

Create exactly 7 steps for this project. Each step must be completable in 30-90 minutes.

INSTRUCTION STYLE FOR THIS STUDENT:
{instruction_style}

Return ONLY a valid JSON object. No markdown wrapping. No explanation. Just raw JSON.

{{
  "steps": [
    {{
      "title": "Step title (short, under 8 words)",
      "instructions": "## Step 1: Title\\n\\n[Full markdown instructions here following the style above]",
      "starter_code": "# Starter scaffold for this step\\n# Student builds on this\\n",
      "starter_filename": "main.py"
    }}
  ]
}}

Rules:
- Exactly 7 steps. No more, no less.
- Step 1 is ALWAYS: Project setup and folder structure
- Step 7 is ALWAYS: Testing, error handling, and README
- Steps must progress from easiest to hardest
- starter_code must be a scaffold, not a complete solution
- starter_filename must match the tech stack (e.g. main.py for FastAPI, index.js for Express, app.jsx for React)
- instructions field must be valid markdown with \\n for newlines (JSON-safe)"""

        result = await call_groq_json(prompt)

        if "steps" not in result or len(result["steps"]) != 7:
            raise HTTPException(status_code=500, detail="AI did not return exactly 7 steps. Please retry.")

        # Build step objects — first step is active, rest are locked
        steps = []
        for i, s in enumerate(result["steps"]):
            step = RoadmapStep(
                id=f"step_{i+1}",
                title=s["title"],
                instructions=s["instructions"],
                starter_code=s["starter_code"],
                starter_filename=s["starter_filename"],
                status="active" if i == 0 else "locked",
            )
            steps.append(step)

        # Build the project document
        project = Project(
            user_id=user_id,
            title=request.project_title,
            brief=request.project_brief,
            tech_stack=request.tech_stack,
            difficulty=request.difficulty,
            steps=steps,
            code_files=[
                CodeFile(
                    filename=steps[0].starter_filename,
                    content=steps[0].starter_code,
                )
            ],
        )

        # Save to MongoDB
        col = get_projects_collection()
        doc = project.model_dump()
        insert_result = await col.insert_one(doc)
        project_id = str(insert_result.inserted_id)

        # Save project_id and scanner_completed to Supabase
        upsert_user_profile(user_id, {
            "active_project_id": project_id,
            "scanner_completed": True,
        })

        # Return the full project
        saved = await col.find_one({"_id": insert_result.inserted_id})
        return {"project_id": project_id, "project": serialize_project(saved)}
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Load a project by ID. Verifies it belongs to the requesting user."""
    col = get_projects_collection()
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await col.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    return serialize_project(doc)

# ─── PSI ENDPOINT ────────────────────────────────────────────────────────────

class PSIRequest(BaseModel):
    project_id: str


@router.post("/psi")
async def run_psi(
    request: PSIRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Analyzes the user's current code files from MongoDB.
    Returns a structured PSI report matching the PsiResult TypeScript type exactly.

    Score dimensions:
    - Code Quality: variable naming, function length, comments, structure
    - Security: hardcoded secrets, input validation, auth checks
    - Performance: N+1 queries, inefficient loops, missing indexes
    - Industry Fit: use of standard patterns, Docker, README, error handling
    """
    col = get_projects_collection()
    try:
        oid = ObjectId(request.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await col.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    code_files = doc.get("code_files", [])
    if not code_files:
        raise HTTPException(
            status_code=400,
            detail="No code files found. Write some code first before running PSI."
        )

    # Build a combined code context for Groq (limit total to 6000 chars)
    code_context = ""
    char_budget = 6000
    for f in code_files:
        snippet = f"--- {f['filename']} ---\n{f['content']}\n\n"
        if len(code_context) + len(snippet) > char_budget:
            break
        code_context += snippet

    project_title = doc.get("title", "Unknown Project")
    tech_stack = ", ".join(doc.get("tech_stack", []))

    prompt = f"""You are a senior software engineer doing a code review for a student's project.

Project: {project_title}
Tech Stack: {tech_stack}

Code submitted for review:
{code_context}

Analyze the code and return ONLY a valid JSON object. No markdown. No explanation. Just raw JSON.

The JSON must have EXACTLY this structure:
{{
  "score": 74,
  "dimensions": [
    {{"name": "Code Quality", "score": 82}},
    {{"name": "Security", "score": 55}},
    {{"name": "Performance", "score": 78}},
    {{"name": "Industry Fit", "score": 70}}
  ],
  "improvements": [
    {{
      "severity": "high",
      "title": "Hardcoded secret key found",
      "description": "Your JWT_SECRET is hardcoded in config.py. Move it to a .env file and load with python-dotenv. Exposed secrets are a critical security risk."
    }},
    {{
      "severity": "medium",
      "title": "Missing input validation on POST routes",
      "description": "3 of your routes accept user input without Pydantic validation. Add request models to prevent invalid data from reaching the database."
    }},
    {{
      "severity": "low",
      "title": "No Dockerfile present",
      "description": "87% of backend job listings require Docker. Add a simple Dockerfile to make your project deployable and industry-ready."
    }}
  ],
  "compliments": [
    "Clean function naming throughout — easy to follow",
    "Good use of async/await for all database calls",
    "Project structure follows standard FastAPI conventions"
  ]
}}

Rules:
- score: weighted average of dimension scores (Code Quality 30%, Security 30%, Performance 20%, Industry Fit 20%)
- dimensions: always exactly 4 items, always in this order: Code Quality, Security, Performance, Industry Fit
- improvements: 2 to 5 items, sorted by severity (high first, then medium, then low)
- compliments: exactly 2 to 3 items — find genuine positives even in bad code
- Be specific — reference actual filenames and line patterns you see in the code
- Be encouraging — this is a student, not a senior engineer"""

    result = await call_groq_json(prompt)

    # Validate structure before returning
    required_keys = ["score", "dimensions", "improvements", "compliments"]
    for key in required_keys:
        if key not in result:
            raise HTTPException(
                status_code=500,
                detail=f"AI returned malformed PSI response (missing '{key}'). Please retry."
            )

    if len(result.get("dimensions", [])) != 4:
        raise HTTPException(
            status_code=500,
            detail="AI returned wrong number of dimensions. Please retry."
        )

    return result  # Matches PsiResult TypeScript type


# ─── DEPLOY ENDPOINT ─────────────────────────────────────────────────────────

class DeployRequest(BaseModel):
    project_id: str
    psi_score: int | None = None   # Optional — frontend passes if PSI was run


@router.post("/deploy")
async def deploy_project(
    request: DeployRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    REAL deployment flow — GitHub push + Vercel deploy + LinkedIn post.
    Streams SSE events for each step.

    Step flow:
      1. Read project files
      2. Prepare repo name + check GitHub token
      3. Create GitHub repository
      4. Push code files + README to GitHub
      5. Deploy to Vercel (if vercel_token available) OR skip
      6. Generate LinkedIn post draft
      7. Save deploy record to Supabase

    Each SSE event: {"step_id": N, "status": "running"|"done"|"error", "label": "...", "detail": "..."}
    Final event:    {"done": true, "live_url": "...", "github_url": "...", "linkedin_post": "...", "linkedin_headline": "..."}

    Fallback: If no GitHub token, streams fake steps (prototype mode) 
    but clearly labels output as demo and still generates the LinkedIn post.
    """
    col = get_projects_collection()
    try:
        oid = ObjectId(request.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await col.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    project_title = doc.get("title", "project")
    project_brief = doc.get("brief", "")
    tech_stack = doc.get("tech_stack", [])
    code_files = doc.get("code_files", [])

    # Load user profile once
    profile = get_user_profile(user_id) or {}
    github_token = profile.get("github_token")
    github_username = profile.get("github_username") or "student"
    vercel_token = profile.get("vercel_token")  # Optional
    user_level = profile.get("level", "Intermediate")
    role = profile.get("role")

    # Build slug for repo name
    slug = _slugify(project_title)
    short_id = str(uuid_lib.uuid4())[:4]
    repo_name = f"{slug}-{short_id}"

    async def stream():
        github_url = f"https://github.com/{github_username}/{repo_name}"
        live_url = f"https://{repo_name}.vercel.app"

        # ── Step 1: Read project files ─────────────────────────────────────
        yield f"data: {json.dumps({'step_id': 1, 'status': 'running', 'label': 'Reading project files'})}\n\n"
        await asyncio.sleep(0.5)
        file_count = len(code_files)
        yield f"data: {json.dumps({'step_id': 1, 'status': 'done', 'label': 'Reading project files', 'detail': f'{file_count} file(s) found'})}\n\n"

        # ── Step 2: Validate GitHub token ──────────────────────────────────
        yield f"data: {json.dumps({'step_id': 2, 'status': 'running', 'label': 'Checking GitHub credentials'})}\n\n"
        await asyncio.sleep(0.4)

        if not github_token:
            # No GitHub token — fallback to demo mode
            yield f"data: {json.dumps({'step_id': 2, 'status': 'done', 'label': 'Checking GitHub credentials', 'detail': 'Demo mode — connect GitHub to push real code'})}\n\n"
            # Run simulated steps then generate real LinkedIn post
            sim_steps = [
                (3, "Creating GitHub repository",  0.8, f"Demo: github.com/{github_username}/{repo_name}"),
                (4, "Pushing code to GitHub",      1.0, "Demo: Code push simulated"),
                (5, "Deploying to Vercel",          1.0, "Demo: Connect GitHub OAuth for real deploy"),
            ]
            for sid, label, delay, detail in sim_steps:
                yield f"data: {json.dumps({'step_id': sid, 'status': 'running', 'label': label})}\n\n"
                await asyncio.sleep(delay)
                yield f"data: {json.dumps({'step_id': sid, 'status': 'done', 'label': label, 'detail': detail})}\n\n"

            # Still generate real LinkedIn post via Groq
            yield f"data: {json.dumps({'step_id': 6, 'status': 'running', 'label': 'Generating LinkedIn post'})}\n\n"
            try:
                linkedin = await generate_linkedin_post(
                    project_title=project_title,
                    project_brief=project_brief,
                    tech_stack=tech_stack,
                    github_url=github_url,
                    live_url=live_url,
                    psi_score=request.psi_score,
                    user_level=user_level,
                    role=role,
                )
                yield f"data: {json.dumps({'step_id': 6, 'status': 'done', 'label': 'Generating LinkedIn post', 'detail': 'Post ready to share'})}\n\n"
            except Exception:
                linkedin = {"post": f"Just built {project_title}! Check it out on GitHub.", "headline": project_title, "hashtags": []}
                yield f"data: {json.dumps({'step_id': 6, 'status': 'done', 'label': 'Generating LinkedIn post', 'detail': 'Basic post generated'})}\n\n"

            yield f"data: {json.dumps({'done': True, 'live_url': live_url, 'github_url': github_url, 'demo_mode': True, 'linkedin_post': linkedin.get('post', ''), 'linkedin_headline': linkedin.get('headline', ''), 'linkedin_hashtags': linkedin.get('hashtags', [])})}\n\n"
            return

        # ── REAL DEPLOY with GitHub token ──────────────────────────────────
        yield f"data: {json.dumps({'step_id': 2, 'status': 'done', 'label': 'Checking GitHub credentials', 'detail': f'GitHub user @{github_username}'})}\n\n"

        # ── Step 3: Create GitHub Repository ───────────────────────────────
        yield f"data: {json.dumps({'step_id': 3, 'status': 'running', 'label': 'Creating GitHub repository'})}\n\n"
        try:
            repo_data = await create_github_repo(
                token=github_token,
                repo_name=repo_name,
                description=project_brief[:200] if project_brief else f"Built with Nirmaan AI Studio",
                private=False,
            )
            actual_repo_url = repo_data.get("html_url", github_url)
            github_url = actual_repo_url
            actual_owner = repo_data.get("owner", {}).get("login", github_username)
            yield f"data: {json.dumps({'step_id': 3, 'status': 'done', 'label': 'Creating GitHub repository', 'detail': f'github.com/{actual_owner}/{repo_name}'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'step_id': 3, 'status': 'error', 'label': 'Creating GitHub repository', 'detail': str(e)[:120]})}\n\n"
            yield f"data: {json.dumps({'done': True, 'error': True, 'live_url': '', 'github_url': '', 'linkedin_post': '', 'linkedin_headline': ''})}\n\n"
            return

        # ── Step 4: Push Code Files to GitHub ──────────────────────────────
        yield f"data: {json.dumps({'step_id': 4, 'status': 'running', 'label': 'Pushing code to GitHub'})}\n\n"
        try:
            pushed_url = await push_files_to_repo(
                token=github_token,
                owner=actual_owner,
                repo_name=repo_name,
                code_files=code_files,
                project_title=project_title,
                project_brief=project_brief,
                tech_stack=tech_stack,
                psi_score=request.psi_score,
            )
            github_url = pushed_url
            yield f"data: {json.dumps({'step_id': 4, 'status': 'done', 'label': 'Pushing code to GitHub', 'detail': f'{file_count} files + README pushed'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'step_id': 4, 'status': 'error', 'label': 'Pushing code to GitHub', 'detail': str(e)[:120]})}\n\n"
            yield f"data: {json.dumps({'done': True, 'error': True, 'live_url': '', 'github_url': github_url, 'linkedin_post': '', 'linkedin_headline': ''})}\n\n"
            return

        # ── Step 5: Deploy to Vercel ────────────────────────────────────────
        yield f"data: {json.dumps({'step_id': 5, 'status': 'running', 'label': 'Deploying to Vercel'})}\n\n"
        if vercel_token:
            try:
                vercel_result = await deploy_to_vercel(
                    vercel_token=vercel_token,
                    github_repo_url=github_url,
                    project_name=repo_name,
                    github_owner=actual_owner,
                    github_token=github_token,
                )
                live_url = vercel_result.get("live_url", f"https://{repo_name}.vercel.app")
                yield f"data: {json.dumps({'step_id': 5, 'status': 'done', 'label': 'Deploying to Vercel', 'detail': live_url})}\n\n"
            except Exception as e:
                # Vercel deploy failed — still a success (GitHub push worked)
                live_url = f"https://github.com/{actual_owner}/{repo_name}#readme"
                yield f"data: {json.dumps({'step_id': 5, 'status': 'done', 'label': 'Deploying to Vercel', 'detail': 'Add Vercel token in settings for live deploy'})}\n\n"
        else:
            # No Vercel token — give them a helpful message
            live_url = f"https://github.com/{actual_owner}/{repo_name}#readme"
            yield f"data: {json.dumps({'step_id': 5, 'status': 'done', 'label': 'Deploying to Vercel', 'detail': 'Add your Vercel token in profile settings to auto-deploy'})}\n\n"

        # ── Step 6: Generate LinkedIn Post ─────────────────────────────────
        yield f"data: {json.dumps({'step_id': 6, 'status': 'running', 'label': 'Generating LinkedIn post'})}\n\n"
        try:
            linkedin = await generate_linkedin_post(
                project_title=project_title,
                project_brief=project_brief,
                tech_stack=tech_stack,
                github_url=github_url,
                live_url=live_url,
                psi_score=request.psi_score,
                user_level=user_level,
                role=role,
            )
            yield f"data: {json.dumps({'step_id': 6, 'status': 'done', 'label': 'Generating LinkedIn post', 'detail': 'Post ready to share'})}\n\n"
        except Exception:
            linkedin = {"post": f"Just shipped {project_title}! Built with {', '.join(tech_stack)}.\n\n🔗 GitHub: {github_url}\n🚀 Live: {live_url}\n\n#buildinpublic #coding", "headline": project_title, "hashtags": ["#buildinpublic"]}
            yield f"data: {json.dumps({'step_id': 6, 'status': 'done', 'label': 'Generating LinkedIn post', 'detail': 'Basic post generated'})}\n\n"

        # ── Step 7: Save to Supabase ────────────────────────────────────────
        yield f"data: {json.dumps({'step_id': 7, 'status': 'running', 'label': 'Saving deploy record'})}\n\n"
        try:
            upsert_user_profile(user_id, {
                "last_deployed_project": project_title,
                "last_deployed_github_url": github_url,
                "last_deployed_live_url": live_url,
            })
            yield f"data: {json.dumps({'step_id': 7, 'status': 'done', 'label': 'Saving deploy record', 'detail': 'Deploy saved to your profile'})}\n\n"
        except Exception:
            yield f"data: {json.dumps({'step_id': 7, 'status': 'done', 'label': 'Saving deploy record', 'detail': 'Profile update skipped'})}\n\n"

        # ── Final event ─────────────────────────────────────────────────────
        yield f"data: {json.dumps({'done': True, 'live_url': live_url, 'github_url': github_url, 'demo_mode': False, 'linkedin_post': linkedin.get('post', ''), 'linkedin_headline': linkedin.get('headline', ''), 'linkedin_hashtags': linkedin.get('hashtags', [])})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/save-code")
async def save_code(
    request: SaveCodeRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Autosave code for a file. Creates or updates the file in code_files array.
    Frontend calls this debounced every 2 seconds when the editor content changes.
    """
    col = get_projects_collection()
    try:
        oid = ObjectId(request.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    now = datetime.now(timezone.utc)

    # Check if file already exists in code_files
    doc = await col.find_one(
        {"_id": oid, "user_id": user_id, "code_files.filename": request.filename}
    )

    if doc:
        # Update existing file
        await col.update_one(
            {"_id": oid, "user_id": user_id, "code_files.filename": request.filename},
            {"$set": {
                "code_files.$.content": request.content,
                "code_files.$.updated_at": now,
                "updated_at": now,
            }}
        )
    else:
        # Add new file
        await col.update_one(
            {"_id": oid, "user_id": user_id},
            {"$push": {
                "code_files": {
                    "filename": request.filename,
                    "content": request.content,
                    "updated_at": now,
                }
            }, "$set": {"updated_at": now}}
        )

    return {"ok": True}


@router.post("/create-file")
async def create_file(
    request: CreateFileRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Create a new file in the project's code_files array.
    Called when user clicks '+' in the editor tab bar and names a file.
    """
    col = get_projects_collection()
    try:
        oid = ObjectId(request.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    now = datetime.now(timezone.utc)

    # Check file doesn't already exist
    doc = await col.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    existing = [f["filename"] for f in doc.get("code_files", [])]
    if request.filename in existing:
        raise HTTPException(status_code=409, detail=f"File '{request.filename}' already exists")

    await col.update_one(
        {"_id": oid, "user_id": user_id},
        {
            "$push": {
                "code_files": {
                    "filename": request.filename,
                    "content": request.content,
                    "updated_at": now,
                }
            },
            "$set": {"updated_at": now},
        }
    )
    return {"ok": True, "filename": request.filename}


@router.delete("/delete-file")
async def delete_file(
    request: DeleteFileRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Delete a file from the project's code_files array.
    Called when user clicks 'x' on a tab and confirms.
    Guard: cannot delete the last file.
    """
    col = get_projects_collection()
    try:
        oid = ObjectId(request.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await col.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    code_files = doc.get("code_files", [])
    if len(code_files) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last file in a project")

    now = datetime.now(timezone.utc)
    await col.update_one(
        {"_id": oid, "user_id": user_id},
        {
            "$pull": {"code_files": {"filename": request.filename}},
            "$set": {"updated_at": now},
        }
    )
    return {"ok": True}


@router.post("/rename-file")
async def rename_file(
    request: RenameFileRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Rename a file in the project's code_files array (preserves content).
    """
    col = get_projects_collection()
    try:
        oid = ObjectId(request.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await col.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    code_files = doc.get("code_files", [])
    existing_names = [f["filename"] for f in code_files]
    if request.old_filename not in existing_names:
        raise HTTPException(status_code=404, detail=f"File '{request.old_filename}' not found")
    if request.new_filename in existing_names:
        raise HTTPException(status_code=409, detail=f"File '{request.new_filename}' already exists")

    now = datetime.now(timezone.utc)
    await col.update_one(
        {"_id": oid, "user_id": user_id, "code_files.filename": request.old_filename},
        {"$set": {
            "code_files.$.filename": request.new_filename,
            "code_files.$.updated_at": now,
            "updated_at": now,
        }}
    )
    return {"ok": True, "new_filename": request.new_filename}


@router.post("/complete-step")
async def complete_step(
    request: CompleteStepRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Mark a step as done, unlock the next step.
    Calculates adaptive_message based on time_taken.
    Awards XP: 50 per step completed.
    Returns the next step (or null if project complete) and an adaptive message.
    """
    col = get_projects_collection()
    try:
        oid = ObjectId(request.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await col.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    steps = doc["steps"]

    # Find the current step index
    current_index = next(
        (i for i, s in enumerate(steps) if s["id"] == request.step_id), None
    )
    if current_index is None:
        raise HTTPException(status_code=404, detail="Step not found")

    now = datetime.now(timezone.utc)

    # Calculate time taken for adaptive message
    started_at = steps[current_index].get("started_at")
    time_taken_minutes = 0
    if started_at:
        if isinstance(started_at, str):
            started_at = datetime.fromisoformat(started_at)
        time_taken_minutes = (now - started_at.replace(tzinfo=timezone.utc)).seconds // 60

    # Determine adaptive message
    if time_taken_minutes < 15:
        adaptive_message = "You're moving fast! The next step will be a bit more challenging."
    elif time_taken_minutes > 90:
        adaptive_message = "Good persistence! The next step includes extra hints to help you."
    else:
        adaptive_message = "Great pace! Keep building momentum."

    # Mark current step done
    steps[current_index]["status"] = "done"
    steps[current_index]["completed_at"] = now

    # Unlock the next step (if exists)
    next_step = None
    new_current_step = current_index
    if current_index + 1 < len(steps):
        steps[current_index + 1]["status"] = "active"
        steps[current_index + 1]["started_at"] = now
        new_current_step = current_index + 1
        next_step = steps[current_index + 1]

        # Pre-fill the next step's starter code in code_files
        next_filename = steps[current_index + 1]["starter_filename"]
        next_code = steps[current_index + 1]["starter_code"]

        # Check if file already exists
        existing_files = [f["filename"] for f in doc.get("code_files", [])]
        if next_filename not in existing_files:
            await col.update_one(
                {"_id": oid},
                {"$push": {
                    "code_files": {
                        "filename": next_filename,
                        "content": next_code,
                        "updated_at": now,
                    }
                }}
            )
    else:
        # All steps done — project complete
        await col.update_one({"_id": oid}, {"$set": {"status": "completed"}})

    # Save updated steps and current_step
    await col.update_one(
        {"_id": oid},
        {"$set": {
            "steps": steps,
            "current_step": new_current_step,
            "updated_at": now,
        }}
    )

    # Award XP in Supabase using the increment_xp RPC function
    try:
        from services.supabase_client import get_supabase
        sb = get_supabase()
        # RPC calls are safer for atomic increments
        sb.rpc("increment_xp", {"user_id": user_id, "amount": 50}).execute()
    except Exception as e:
        # Fallback to direct update if RPC fails
        print(f"Error calling RPC increment_xp: {e}")
        profile = (
            sb.table("user_profiles")
            .select("xp_score")
            .eq("id", user_id)
            .single()
            .execute()
        )
        new_xp = (profile.data.get("xp_score") or 0) + 50
        (
            sb.table("user_profiles")
            .update({"xp_score": new_xp, "updated_at": now.isoformat()})
            .eq("id", user_id)
            .execute()
        )

    return {
        "next_step": next_step,
        "adaptive_message": adaptive_message,
        "xp_gained": 50,
    }


@router.post("/copilot")
async def copilot(
    request: CopilotRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Enhanced streaming copilot endpoint.
    - Richer context: knows full roadmap progress, all file names, step index
    - Persistent: saves every exchange to MongoDB chat_history
    - Quick actions: debug / explain / optimize / next_hint inject special prompts
    - Smart Apply Fix: wraps code blocks with filename so frontend targets correct file
    Returns SSE stream.
    """
    # ── Load project for full context ────────────────────────────────────────
    col = get_projects_collection()
    try:
        oid = ObjectId(request.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await col.find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    # Build context strings
    project_title = doc.get("title", "")
    tech_stack = ", ".join(doc.get("tech_stack", []))
    difficulty = doc.get("difficulty", "Intermediate")
    steps = doc.get("steps", [])
    current_step_idx = doc.get("current_step", 0)
    total_steps = len(steps)

    # Steps progress summary (compact)
    steps_summary = "\n".join([
        f"  Step {i+1}: {s['title']} [{s['status'].upper()}]"
        for i, s in enumerate(steps)
    ])

    # All code files context (truncated to fit context window)
    code_files = doc.get("code_files", [])
    all_code_context = ""
    char_budget = 4000
    for f in code_files:
        snippet = f"--- {f['filename']} ---\n{f['content']}\n\n"
        if len(all_code_context) + len(snippet) > char_budget:
            all_code_context += f"--- {f['filename']} --- [truncated]\n\n"
            break
        all_code_context += snippet

    # Quick action overrides
    user_message_override = None
    if request.quick_action == "debug":
        user_message_override = (
            "Please analyze my current code carefully and find any bugs, errors, or logic issues. "
            "Show me exactly what's wrong and how to fix it with a corrected code block."
        )
    elif request.quick_action == "explain":
        user_message_override = (
            "Please explain what my current code does line by line in simple terms. "
            "Highlight any parts that are particularly important or tricky."
        )
    elif request.quick_action == "optimize":
        user_message_override = (
            "Review my code for performance issues, bad patterns, or things that won't work in production. "
            "Rewrite the problem areas with a cleaner, optimized version."
        )
    elif request.quick_action == "next_hint":
        user_message_override = (
            f"I'm on step {current_step_idx + 1} of {total_steps}: '{request.current_step_title}'. "
            "Give me a specific hint about what I should do next without giving away the full solution. "
            "Be concrete — tell me the next 1-2 things to write or implement."
        )

    # Build the system prompt — rich with full project context
    system_prompt = f"""You are Nirmaan Copilot — an expert coding mentor embedded in a student's IDE.

━━━ PROJECT CONTEXT ━━━
Title: {project_title}
Tech Stack: {tech_stack}
Difficulty: {difficulty}
Progress: Step {current_step_idx + 1} of {total_steps}

All Steps:
{steps_summary}

━━━ CURRENT STEP ━━━
Step {current_step_idx + 1}: {request.current_step_title}

Step Goal:
{request.current_step_instructions[:1000]}

━━━ ALL PROJECT FILES ━━━
{all_code_context or "No files written yet."}

━━━ YOUR RULES ━━━
1. You are a mentor, not a code-completion machine. Guide, don't solve.
2. When writing code to inject into the editor, ALWAYS use this exact format:
   ```filename.py
   code here
   ```
   Replace filename.py with the ACTUAL file this code belongs to (e.g. main.py, app.jsx, index.js).
   The student clicks "Apply Fix" and it goes directly into that file.
3. For bugs: explain WHY it's a bug first, then show the fix.
4. For new features: explain the approach in 1-2 sentences, then show minimal code.
5. Never write complete solutions for untouched steps — only the current step.
6. Be specific: reference actual variable names, function names, and filenames from the code above.
7. Keep responses under 350 words unless showing code.
8. Always end with one encouraging sentence or a next step hint."""

    # Build messages list — use session messages (frontend maintains order)
    messages_for_groq = [
        {"role": m.role, "content": m.content}
        for m in request.messages
    ]

    # If quick action, override the last user message
    if user_message_override and messages_for_groq:
        messages_for_groq[-1]["content"] = user_message_override
    elif user_message_override:
        messages_for_groq = [{"role": "user", "content": user_message_override}]

    # ── Stream the response ───────────────────────────────────────────────────
    full_response = ""

    async def stream():
        nonlocal full_response
        async for chunk in call_groq_stream(
            messages=messages_for_groq,
            system=system_prompt,
        ):
            full_response += chunk
            yield f"data: {json.dumps({'content': chunk})}\n\n"

        # Extract code blocks and send metadata event
        # Format: ```filename.ext ... ``` — capture filename + code
        code_blocks = re.findall(r"```([\w./\-]+)\n([\s\S]*?)```", full_response)
        if code_blocks:
            # Send each code block as a separate event so frontend can apply to correct file
            blocks_data = [{"filename": fname, "code": code} for fname, code in code_blocks]
            yield f"data: {json.dumps({'code_blocks': blocks_data})}\n\n"

        yield "data: [DONE]\n\n"

        # ── Persist to MongoDB asynchronously ────────────────────────────────
        now = datetime.now(timezone.utc)
        # The last message in request.messages is the user's question
        user_content = messages_for_groq[-1]["content"] if messages_for_groq else ""
        if user_message_override:
            user_content = user_message_override

        new_messages = []
        if user_content:
            new_messages.append({
                "role": "user",
                "content": user_content,
                "timestamp": now,
                "step_id": f"step_{current_step_idx + 1}",
                "has_code_block": False,
            })
        if full_response:
            new_messages.append({
                "role": "assistant",
                "content": full_response,
                "timestamp": now,
                "step_id": f"step_{current_step_idx + 1}",
                "has_code_block": bool(code_blocks),
            })

        if new_messages:
            await col.update_one(
                {"_id": oid},
                {
                    "$push": {"chat_history": {"$each": new_messages}},
                    "$set": {"updated_at": now},
                }
            )

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/{project_id}/chat-history")
async def get_chat_history(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    step_id: str | None = None,     # Optional filter by step
    limit: int = 50,
):
    """
    Returns the persistent chat history for a project.
    Optionally filtered by step_id (e.g. 'step_1').
    Frontend calls this on page load to restore chat context.
    """
    col = get_projects_collection()
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await col.find_one(
        {"_id": oid, "user_id": user_id},
        {"chat_history": 1}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    history = doc.get("chat_history", [])

    # Filter by step if requested
    if step_id:
        history = [m for m in history if m.get("step_id") == step_id]

    # Return most recent N messages
    history = history[-limit:]

    # Convert datetime objects to ISO strings for JSON
    for msg in history:
        if isinstance(msg.get("timestamp"), datetime):
            msg["timestamp"] = msg["timestamp"].isoformat()

    return {"messages": history, "total": len(history)}