"""
完成反馈：写入 Completion，更新 Task 状态与统计（EMA），重算 Epic 进度。
"""
from sqlalchemy.orm import Session

from app.models.completion import Completion
from app.models.task import Task, TaskStatus
from app.services.epic_progress import recalculate_epic_progress

EMA_ALPHA = 0.2


def _ema_prev_next(prev: float | None, new_val: float, alpha: float = EMA_ALPHA) -> float:
    """EMA 更新：prev 为 None 时返回 new_val。"""
    if prev is None:
        return float(new_val)
    return (1 - alpha) * prev + alpha * new_val


def submit_completion_feedback(
    task_id: int,
    difficulty: int,
    actual_minutes: int,
    output: str | None,
    db: Session,
    *,
    output_size: int | None = None,
    task_type: str | None = None,
    confidence: int | None = None,
) -> tuple[Completion, Task, float]:
    """
    提交完成反馈：写 Completion，Task 状态改为 done，Task 统计字段 EMA 更新，Epic progress 重算。
    返回 (completion, task, epic_progress)。
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise ValueError("Task not found")
    if task.status == TaskStatus.done.value:
        raise ValueError("Task already completed")
    epic_id = task.epic_id

    # 若未传 output_size 且传了 output，用 output 长度粗略估算 1–5
    if output_size is None and output:
        n = len(output.strip())
        output_size = min(5, max(1, (n // 50) + 1))

    completion = Completion(
        task_id=task_id,
        difficulty=max(1, min(5, difficulty)),
        actual_minutes=actual_minutes,
        output=output,
        output_size=output_size,
        task_type=task_type,
        confidence=confidence,
    )
    db.add(completion)
    db.flush()

    task.status = TaskStatus.done.value
    task.avg_actual_minutes = _ema_prev_next(task.avg_actual_minutes, actual_minutes)
    task.difficulty_avg = _ema_prev_next(task.difficulty_avg, completion.difficulty)
    if output_size is not None:
        task.output_size_avg = _ema_prev_next(task.output_size_avg, output_size)
    if task_type:
        task.task_type = task_type

    progress = recalculate_epic_progress(epic_id, db)

    db.commit()
    db.refresh(completion)
    db.refresh(task)
    return completion, task, progress


def complete_all_epic_tasks(epic_id: int, db: Session) -> int:
    """
    将某 Epic 下全部未完成子任务一次性标记完成（用于「拖拽 Epic 到已完成」的人工确认后）。
    为每条任务写入一条 Completion（实际用时取预估值，难易度默认 3），重算 Epic 进度。
    返回本次新完成的任务数。
    """
    tasks = (
        db.query(Task)
        .filter(Task.epic_id == epic_id, Task.status != TaskStatus.done.value)
        .all()
    )
    count = 0
    for task in tasks:
        completion = Completion(
            task_id=task.id,
            difficulty=3,
            actual_minutes=task.est_minutes or 45,
            output=None,
            output_size=None,
            task_type=task.task_type,
        )
        db.add(completion)
        task.status = TaskStatus.done.value
        count += 1
    db.flush()
    recalculate_epic_progress(epic_id, db)
    db.commit()
    return count


def reopen_epic_tasks(epic_id: int, db: Session) -> int:
    """
    重新打开某 Epic 下全部已完成子任务（status → pending），用于把 Epic 从「已完成」移回。
    保留历史 Completion 记录；进度按任务状态自然重算下降。返回被重开的任务数。
    """
    tasks = (
        db.query(Task)
        .filter(Task.epic_id == epic_id, Task.status == TaskStatus.done.value)
        .all()
    )
    for task in tasks:
        task.status = TaskStatus.pending.value
    db.flush()
    recalculate_epic_progress(epic_id, db)
    db.commit()
    return len(tasks)
