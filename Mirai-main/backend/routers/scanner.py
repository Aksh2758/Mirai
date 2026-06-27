from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from services.github_extractor import extract_github_data
from services.pdf_extractor import extract_pdf_data
from services.manual_processor import process_manual_answers, MANUAL_QUESTIONS
from services.supabase_client import get_current_user_id, get_user_profile

router = APIRouter()


class GithubScanRequest(BaseModel):
    github_url: str | None = None
    # github_token is read from the user's profile, not sent by frontend


class ManualAnswer(BaseModel):
    question_id: int
    question: str
    answer: str


class ManualScanRequest(BaseModel):
    answers: list[ManualAnswer]


@router.get("/questions")
async def get_manual_questions():
    """Returns the 8 manual quiz questions. Frontend calls this to render the quiz."""
    return {"questions": MANUAL_QUESTIONS}


@router.post("/github")
async def scan_github(
    request: GithubScanRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Scans a GitHub profile.
    - If the user logged in with GitHub OAuth, their token is in their profile.
    - If the user is email-logged-in, github_url is required.
    """
    profile = get_user_profile(user_id)
    github_token = profile.get("github_token") if profile else None

    if not github_token and not request.github_url:
        raise HTTPException(
            status_code=400,
            detail="Either log in with GitHub or provide a GitHub URL"
        )

    try:
        data = await extract_github_data(
            github_url=request.github_url,
            github_token=github_token,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"GitHub fetch failed: {str(e)}")

    return data


@router.post("/pdf")
async def scan_pdf(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Accepts a PDF file and extracts structured skill data."""
    if not file.filename or not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    file_bytes = await file.read()

    if len(file_bytes) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="PDF must be under 10MB")

    try:
        data = await extract_pdf_data(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {str(e)}")

    return data


@router.post("/manual")
async def scan_manual(
    request: ManualScanRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Accepts quiz answers and returns structured skill data."""
    if len(request.answers) < 5:
        raise HTTPException(status_code=400, detail="At least 5 answers required")

    try:
        data = await process_manual_answers([a.model_dump() for a in request.answers])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Manual processing failed: {str(e)}")

    return data
