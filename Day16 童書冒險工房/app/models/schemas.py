
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class Differentiator(BaseModel):
    theme: str
    setting: str
    age_range: str = "3-6"
    tone: str = "溫暖幽默"
    language_tricks: List[str] = Field(default_factory=list)
    visual_tricks: List[str] = Field(default_factory=list)

class Character(BaseModel):
    id: str
    name: str
    role: str = "supporting"
    description: str = ""
    appearance_prompt: str = ""
    voice: str = "alloy"
    deleted: bool = False

class Outline(BaseModel):
    id: str
    title: str
    logline: str
    cast: List[Character]
    beats: List[str]

class TemplateInfo(BaseModel):
    key: str
    name: str
    category: str
    age_hint: str = ""
    description: str = ""
    skeleton: Dict[str, Any] = {}

class SpreadPlan(BaseModel):
    page: int
    summary: str
    cast_names: List[str]
    display_text: str
    image_prompt: str
    sfx_tags: List[str] = []
    camera: Dict[str, Any] = {}

class Storyboard(BaseModel):
    spreads: List[SpreadPlan]

class ExportRequest(BaseModel):
    project_id: str
    title: str
    author: str
    mode: str = "pdf"
