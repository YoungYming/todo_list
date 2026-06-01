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


class PinCreate(BaseModel):
    """锁定今日必做：task_id 或 epic_id（锁定该 Epic 全部未完成子任务）二选一。"""
    task_id: int | None = None
    epic_id: int | None = None


class PinItem(BaseModel):
    """白板上的一条锁定子任务。"""
    id: int
    epic_id: int
    title: str
    est_minutes: int
    due_date: date | None = None
    epic_title: str
