from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal

# GitHub Scanner Models

class GitHubRequest(BaseModel):
    github_url: str

class RepositoryInfo(BaseModel):
    name: str
    description: Optional[str] = None
    language: Optional[str] = None
    stars: int = 0
    url: str

class GitHubResponse(BaseModel):
    username: str
    repo_count: int
    language_percentages: Dict[str, float]
    commit_frequency: Optional[str] = None
    repositories: List[RepositoryInfo]


# PDF Scanner Models

class PDFResponse(BaseModel):
    extracted_text: str
    page_count: int


# Manual Quiz Models

class QuizAnswer(BaseModel):
    question_id: str
    answer: str

class ManualRequest(BaseModel):
    answers: List[QuizAnswer]

class ManualResponse(BaseModel):
    answers: List[QuizAnswer]
    summary: str


# Skill DNA Analysis Models

class AnalyzeRequest(BaseModel):
    github_data: Optional[GitHubResponse] = None
    pdf_text: Optional[str] = None
    quiz_answers: Optional[List[QuizAnswer]] = None

class SkillDNA(BaseModel):
    role: str
    role_pct: float = Field(ge=0, le=100)
    secondary_roles: List[str]
    level: Literal["Beginner", "Intermediate", "Advanced"]
    pace: Literal["Slow", "Normal", "Fast"]
    top_languages: List[str]
    suggested_project_types: List[str]
