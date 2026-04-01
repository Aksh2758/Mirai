from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone
from services.supabase_client import get_current_user_id, upsert_user_profile
from services.groq_service import call_groq_json, call_groq_stream
from db.mongo_client import get_mongo_db
from models.project import Project, RoadmapStep, CodeFile
import json

router = APIRouter()

def get_projects_collection():
    db = get_mongo_db()
    return db["projects"]

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
        # Generate roadmap steps using Groq
        prompt = f"""You are a coding mentor creating a step-by-step project guide.

Project: {request.project_title}
Description: {request.project_brief}
Tech Stack: {', '.join(request.tech_stack)}
Student Level: {request.user_level}
Difficulty: {request.difficulty}

Create exactly 7 steps for this project. Each step must be completable in 30-90 minutes.

Return ONLY a valid JSON object. No markdown. No explanation. Just raw JSON.

{{
  "steps": [
    {{
      "title": "Step title (short, under 8 words)",
      "instructions": "## Step 1: Title\\n\\nDetailed markdown instructions for what to do in this step. Include:\\n- What to build\\n- Why it matters\\n- Key concepts to understand\\n- Specific tasks to complete\\n\\nBe specific and helpful. At least 150 words.",
      "starter_code": "# Starter code for this step\\n# Student will build on this\\n\\nprint('hello')",
      "starter_filename": "main.py"
    }}
  ]
}}

Rules:
- Steps must go from easiest (setup) to hardest (deployment/testing)
- starter_code should be a helpful scaffold, not a complete solution
- starter_filename must be appropriate for the tech stack
- instructions must be detailed markdown with headers and bullet points
- Step 1 is ALWAYS project setup and folder structure"""

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