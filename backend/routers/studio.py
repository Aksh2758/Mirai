from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from services.supabase_client import get_current_user_id, upsert_user_profile
from services.groq_service import call_groq_json, call_groq_stream
from db.mongo_client import get_mongo_db, get_projects_collection
from models.project import Project, RoadmapStep, CodeFile
import json
import asyncio
import uuid as uuid_lib
import math
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


class CompleteStepRequest(BaseModel):
    project_id: str
    step_id: str


class CopilotMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class CopilotRequest(BaseModel):
    project_id: str
    messages: list[CopilotMessage]
    current_code: str
    current_step_title: str
    current_step_instructions: str


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


@router.post("/deploy")
async def deploy_project(
    request: DeployRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Simulated deployment flow.
    Returns a streaming SSE response with step-by-step build logs.

    Each SSE event is a JSON object:
    {"step_id": 1, "status": "running"|"done"|"error", "label": "...", "detail": "..."}

    Final event:
    {"done": true, "live_url": "https://...", "github_url": "https://..."}
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

    # Generate a deterministic slug from project title
    slug = project_title.lower().replace(" ", "-").replace("_", "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-")[:30]
    short_id = str(uuid_lib.uuid4())[:4]
    live_url = f"https://{slug}-{short_id}.nirmaan.app"

    # Get github username from Supabase
    profile = get_user_profile(user_id)
    github_username = profile.get("github_username") or "student"
    github_url = f"https://github.com/{github_username}/{slug}"

    # Define the deployment steps with realistic timing
    deploy_steps = [
        {"id": 1, "label": "Reading project files",       "delay": 0.8,  "detail": f"{len(doc.get('code_files', []))} files found"},
        {"id": 2, "label": "Bundling source code",        "delay": 1.2,  "detail": "Compressed to 2.4 KB"},
        {"id": 3, "label": "Running dependency check",    "delay": 1.5,  "detail": "All dependencies resolved"},
        {"id": 4, "label": "Building Docker container",   "delay": 2.0,  "detail": "Image built successfully"},
        {"id": 5, "label": "Pushing to Nirmaan cloud",    "delay": 1.8,  "detail": "Upload complete"},
        {"id": 6, "label": "Starting application server", "delay": 1.2,  "detail": "Server running on port 8080"},
        {"id": 7, "label": "Creating GitHub repository",  "delay": 1.0,  "detail": f"github.com/{github_username}/{slug}"},
        {"id": 8, "label": "Pushing code to GitHub",      "delay": 1.5,  "detail": "Initial commit pushed"},
    ]

    async def stream():
        for step in deploy_steps:
            # Emit "running" state
            yield f"data: {json.dumps({'step_id': step['id'], 'status': 'running', 'label': step['label']})}\n\n"
            await asyncio.sleep(step["delay"])
            # Emit "done" state
            yield f"data: {json.dumps({'step_id': step['id'], 'status': 'done', 'label': step['label'], 'detail': step['detail']})}\n\n"

        # Final event with URLs
        yield f"data: {json.dumps({'done': True, 'live_url': live_url, 'github_url': github_url})}\n\n"

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
    Streaming copilot endpoint. Returns SSE (Server-Sent Events) stream.
    System prompt includes the current step context and current code.
    Frontend reads this with fetch + ReadableStream.
    """
    system_prompt = f"""You are Nirmaan Copilot, an expert coding assistant helping a student build a real project.

Current project step: {request.current_step_title}

Step instructions:
{request.current_step_instructions}

Student's current code:
```
{request.current_code[:3000]}
```

Your job:
- Help the student complete this specific step
- Give concise, actionable advice
- When you suggest code to add or replace, wrap it in a code block with the filename as the language tag:
  ```filename.py
  your code here
  ```
- The student can click "Apply Fix" to inject your code directly into their editor
- Do not give away the complete solution — guide them step by step
- If they are stuck, break the problem into smaller pieces
- Be encouraging and specific"""

    async def stream():
        async for chunk in call_groq_stream(
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
            system=system_prompt,
        ):
            # SSE format: data: <content>\n\n
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )