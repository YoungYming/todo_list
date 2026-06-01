from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.task import Task
from app.schemas.completion import CompleteFeedbackRequest, CompleteFeedbackResponse
from app.schemas.task import TaskRead
from app.services.completion_service import submit_completion_feedback

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/unfinished", response_model=list[TaskRead])
def list_unfinished(
    deadline_within_days: int = Query(7, ge=0, description="截止日在 N 天内；0 表示不限制截止日"),
    db: Session = Depends(get_db),
):
    """
    未完成且截止在 N 天内的任务（供 OpenClaw 等获取临近截止列表、发提醒）。
    """
    q = db.query(Task).filter(Task.status != "done")
    if deadline_within_days > 0:
        limit_date = date.today() + timedelta(days=deadline_within_days)
        q = q.filter(Task.due_date.isnot(None), Task.due_date <= limit_date)
    q = q.order_by(Task.due_date.asc().nulls_last(), Task.id.asc())
    return q.all()


@router.post("/{task_id}/complete_feedback", response_model=CompleteFeedbackResponse, status_code=201)
def post_complete_feedback(task_id: int, body: CompleteFeedbackRequest, db: Session = Depends(get_db)):
    """
    提交完成反馈：写入 Completion，Task 状态改为 done，更新 Task 统计字段（EMA），
    重算 Epic 进度。勾选完成时由前端弹表单收集后调用此接口。
    """
    try:
        completion, task, progress = submit_completion_feedback(
            task_id,
            difficulty=body.difficulty,
            actual_minutes=body.actual_minutes,
            output=body.output,
            db=db,
            output_size=body.output_size,
            task_type=body.task_type,
            confidence=body.confidence,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail="Task not found")
        if "already completed" in msg.lower():
            raise HTTPException(status_code=409, detail="Task already completed")
        raise HTTPException(status_code=400, detail=msg)
    return CompleteFeedbackResponse(
        task_id=task.id,
        epic_id=task.epic_id,
        epic_progress=progress,
        completion_id=completion.id,
    )
