from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.groq_service import analyze_skill_dna
from services.supabase_client import get_current_user_id, upsert_user_profile

router = APIRouter()


class AnalyzeRequest(BaseModel):
    github_data: dict | None = None
    pdf_data: dict | None = None
    manual_data: dict | None = None


@router.post("/analyze")
async def analyze(
    request: AnalyzeRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    The core AI analyzer. Takes data from any combination of scanner paths
    and returns SkillDNA + 3 project suggestions.
    Also saves the SkillDNA to the user's Supabase profile.
    """
    if not request.github_data and not request.pdf_data and not request.manual_data:
        raise HTTPException(
            status_code=400,
            detail="At least one data source (github, pdf, or manual) is required"
        )

    try:
        result = await analyze_skill_dna(
            github_data=request.github_data,
            pdf_data=request.pdf_data,
            manual_data=request.manual_data,
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Validate structure before saving
    if "skill_dna" not in result or "projects" not in result:
        raise HTTPException(
            status_code=500,
            detail="AI returned unexpected structure. Please try again."
        )

    if len(result["projects"]) != 3:
        raise HTTPException(
            status_code=500,
            detail="AI did not return exactly 3 projects. Please try again."
        )

    # Determine scanner_method based on what data was provided
    methods = []
    if request.github_data: methods.append("github")
    if request.pdf_data: methods.append("pdf")
    if request.manual_data: methods.append("manual")
    
    scanner_method = "combined" if len(methods) > 1 else (methods[0] if methods else "manual")

    # Save to Supabase user_profiles
    skill_dna = result["skill_dna"]
    upsert_user_profile(user_id, {
        "role": skill_dna.get("role"),
        "level": skill_dna.get("level"),
        "pace_factor": skill_dna.get("pace_factor"),
        "skill_scores": skill_dna.get("skill_scores", {}),
        "scanner_method": scanner_method,
        "scanner_completed": True,
    })

    return result
