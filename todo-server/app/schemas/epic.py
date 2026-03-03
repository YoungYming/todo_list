from datetime import date, datetime
from pydantic import BaseModel, ConfigDict


class EpicCreate(BaseModel):
    title: str
    description: str | None = None
    start_date: date | None = None
    due_date: date | None = None
    priority: int = 3


class EpicUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_date: date | None = None
    due_date: date | None = None
    priority: int | None = None
    progress: float | None = None


class EpicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    start_date: date | None
    due_date: date | None
    priority: int
    velocity_estimator_version: str | None
    progress: float
    created_at: datetime
    updated_at: datetime
