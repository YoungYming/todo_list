from pydantic import BaseModel, Field


class CandidateTaskSchema(BaseModel):
    title: str
    est_minutes: int
    due_date: str | None = None
    reason: str | None = None


class SplitCandidateSetRead(BaseModel):
    candidate_set_id: str
    provider_name: str
    tasks: list[CandidateTaskSchema]
    score_hint: float | None = None


class FinalTaskItem(BaseModel):
    title: str
    est_minutes: int = 45
    due_date: str | None = None
    dependency_task_ids: list[int] | None = None


class SplitDecisionCreate(BaseModel):
    chosen_candidate_set_id: str | None = None
    final_tasks_json: list[FinalTaskItem] = Field(..., min_length=1, description="至少 1 条子任务")
    edits_diff: str | None = None
