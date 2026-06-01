from datetime import date

from pydantic import BaseModel


class TodayTaskItem(BaseModel):
    """今日待办中的一条任务。"""
    id: int
    epic_id: int
    title: str
    est_minutes: int
    due_date: date | None


class TodayResponse(BaseModel):
    """GET /api/today 响应。"""
    plan_date: date
    available_minutes: int
    tasks: list[TodayTaskItem]
    selection_reason: str | None = None
