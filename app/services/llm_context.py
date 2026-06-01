"""
为子任务、大任务、每日规划构建「大模型 chat 友好」的上下文结构。
统一使用简短英文 key、必要字段，便于模型解析与推理；不调用任何外部 LLM。
"""
from datetime import date

from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.epic import Epic
from app.services.scheduler import build_today_plan


def task_to_llm_context(task: Task, epic: Epic | None, db: Session) -> dict:
    """单条子任务：供大模型理解与规划。"""
    return {
        "type": "task",
        "id": task.id,
        "title": task.title,
        "est_minutes": task.est_minutes,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "status": task.status,
        "epic_id": task.epic_id,
        "epic_title": epic.title if epic else None,
    }


def epic_to_llm_context(epic: Epic, db: Session) -> dict:
    """大任务（Epic）：含其下子任务摘要，供大模型理解。"""
    tasks = db.query(Task).filter(Task.epic_id == epic.id).order_by(Task.id).all()
    return {
        "type": "epic",
        "id": epic.id,
        "title": epic.title,
        "description": (epic.description or "")[:500],
        "due_date": epic.due_date.isoformat() if epic.due_date else None,
        "priority": epic.priority,
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "est_minutes": t.est_minutes,
                "status": t.status,
                "due_date": t.due_date.isoformat() if t.due_date else None,
            }
            for t in tasks
        ],
        "task_count": len(tasks),
    }


def daily_plan_to_llm_context(
    plan_date: date,
    available_minutes: int,
    db: Session,
    *,
    include_epic_title: bool = True,
) -> dict:
    """每日规划：系统选出的今日待办 + 可用时长，供大模型结合用户「其他安排」做动态规划。"""
    tasks, reason = build_today_plan(plan_date, available_minutes, db, save_to_daily_plan=True)
    epic_ids = {t.epic_id for t in tasks}
    epics = {e.id: e for e in db.query(Epic).filter(Epic.id.in_(epic_ids)).all()}
    task_list = []
    for t in tasks:
        item = {
            "id": t.id,
            "title": t.title,
            "est_minutes": t.est_minutes,
            "due_date": t.due_date.isoformat() if t.due_date else None,
        }
        if include_epic_title and t.epic_id in epics:
            item["epic_title"] = epics[t.epic_id].title
        task_list.append(item)
    return {
        "type": "daily_plan",
        "plan_date": plan_date.isoformat(),
        "available_minutes": available_minutes,
        "selection_reason": reason,
        "tasks": task_list,
    }
