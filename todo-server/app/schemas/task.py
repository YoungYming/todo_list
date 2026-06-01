from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class TaskRead(BaseModel):
    """子任务只读视图，用于列表/详情。"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    epic_id: int
    title: str
    est_minutes: int
    est_minutes_user: int | None
    due_date: date | None
    dependency_task_ids: list[int] | None
    status: str
    weight: float | None
    task_type: str | None
    created_at: datetime
    updated_at: datetime
