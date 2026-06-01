"""
今日锁定（白板=后端锁定项）服务。

- 锁定项存于 DailyPin（plan_date + task_id）。
- 读取时与 Task/Epic 关联，自动过滤已删除或已完成的任务（SQLite 默认不强制外键，
  这里在读取层兜底，避免脏数据出现在白板/今日待办）。
"""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models.daily_pin import DailyPin
from app.models.epic import Epic
from app.models.task import Task, TaskStatus


def _valid_pins_query(db: Session, plan_date: date):
    """返回 (DailyPin, Task, Epic) 行，仅含存在且未完成的任务。"""
    return (
        db.query(DailyPin, Task, Epic)
        .join(Task, DailyPin.task_id == Task.id)
        .join(Epic, Task.epic_id == Epic.id)
        .filter(DailyPin.plan_date == plan_date)
        .filter(Task.status != TaskStatus.done.value)
        .order_by(DailyPin.created_at.asc())
    )


def pinned_task_ids(db: Session, plan_date: date) -> list[int]:
    """当日锁定且仍有效（存在、未完成）的 task id 列表。"""
    rows = _valid_pins_query(db, plan_date).all()
    return [t.id for (_p, t, _e) in rows]


def list_pinned_details(db: Session, plan_date: date) -> list[dict]:
    """当日锁定项详情，用于白板渲染。"""
    rows = _valid_pins_query(db, plan_date).all()
    return [
        {
            "id": t.id,
            "epic_id": t.epic_id,
            "title": t.title,
            "est_minutes": t.est_minutes,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "epic_title": e.title,
        }
        for (_p, t, e) in rows
    ]


def add_pin(db: Session, plan_date: date, task_id: int) -> bool:
    """锁定单个任务（幂等）。任务不存在或已完成则不锁定。返回是否新增。"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or task.status == TaskStatus.done.value:
        return False
    exists = (
        db.query(DailyPin)
        .filter(DailyPin.plan_date == plan_date, DailyPin.task_id == task_id)
        .first()
    )
    if exists:
        return False
    db.add(DailyPin(plan_date=plan_date, task_id=task_id))
    return True


def add_pins_for_epic(db: Session, plan_date: date, epic_id: int) -> int:
    """锁定某 Epic 下全部未完成子任务，返回新增条数。"""
    tasks = (
        db.query(Task)
        .filter(Task.epic_id == epic_id, Task.status != TaskStatus.done.value)
        .all()
    )
    added = 0
    for t in tasks:
        if add_pin(db, plan_date, t.id):
            added += 1
    return added


def remove_pin(db: Session, plan_date: date, task_id: int) -> int:
    """取消锁定（返回删除条数）。"""
    return (
        db.query(DailyPin)
        .filter(DailyPin.plan_date == plan_date, DailyPin.task_id == task_id)
        .delete()
    )
