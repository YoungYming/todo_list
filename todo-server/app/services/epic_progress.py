"""
Epic 进度统一重算：所有会改任务状态/任务集合的地方都应调用。
"""
from sqlalchemy.orm import Session

from app.models.epic import Epic
from app.models.task import Task
from app.models.task import TaskStatus


def recalculate_epic_progress(epic_id: int, db: Session) -> float:
    """
    按子任务 weight/工时加权的已完成占比，0.0–1.0。
    更新 epic.progress 并返回新值。
    """
    tasks = db.query(Task).filter(Task.epic_id == epic_id).all()
    if not tasks:
        progress = 0.0
    else:
        total_weight = 0.0
        done_weight = 0.0
        for t in tasks:
            w = t.weight if t.weight is not None else float(t.est_minutes)
            total_weight += w
            if t.status == TaskStatus.done.value:
                done_weight += w
        progress = round(done_weight / total_weight, 4) if total_weight > 0 else 0.0

    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if epic:
        epic.progress = progress
    return progress
