from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional
from bson import ObjectId

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")

class RoadmapStep(BaseModel):
    id: str
    title: str
    instructions: str
    starter_code: str
    starter_filename: str = "main.py"
    status: str = "locked"  # "locked" | "active" | "done"
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class CodeFile(BaseModel):
    filename: str
    content: str
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Project(BaseModel):
    user_id: str
    title: str
    brief: str
    tech_stack: List[str]
    difficulty: str
    current_step: int = 0
    status: str = "active"
    steps: List[RoadmapStep]
    code_files: List[CodeFile] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {ObjectId: str}
        populate_by_name = True
        arbitrary_types_allowed = True
