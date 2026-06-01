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
