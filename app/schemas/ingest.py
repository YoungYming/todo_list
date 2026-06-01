from pydantic import BaseModel, Field


class IngestTaskItem(BaseModel):
    title: str
    est_minutes: int = 45
    due_date: str | None = None
    reason: str | None = None


class IngestExtractResult(BaseModel):
    title: str
    summary: str = ""
    tasks: list[IngestTaskItem] = []


class IngestCommitRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str | None = None
    due_date: str | None = None
    priority: int = 3
    tasks: list[IngestTaskItem] = Field(..., min_length=1, description="至少 1 条子任务")
