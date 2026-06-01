"""
为大模型 chat 预留的上下文与 prompt 接口。
不调用任何外部 LLM，仅返回结构化上下文和组装好的 prompt，由调用方自行请求大模型。
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.models.epic import Epic
from app.models.task import Task
from app.prompts.daily_planning import build_daily_prompt
from app.schemas.llm import BuildDailyPromptRequest, BuildDailyPromptResponse
from app.services.llm_context import (
    daily_plan_to_llm_context,
    epic_to_llm_context,
    task_to_llm_context,
)

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/context/task/{task_id}")
def get_task_context(task_id: int, db: Session = Depends(get_db)):
    """
    单条子任务的 LLM 上下文（AI 友好 JSON）。
    可用于：把该任务丢给大模型做拆解、估时或排期建议。
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    epic = db.query(Epic).filter(Epic.id == task.epic_id).first()
    return task_to_llm_context(task, epic, db)


@router.get("/context/epic/{epic_id}")
def get_epic_context(epic_id: int, db: Session = Depends(get_db)):
    """
    大任务（Epic）的 LLM 上下文（含子任务摘要）。
    可用于：让大模型理解整块目标并做拆分或排期建议。
    """
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    return epic_to_llm_context(epic, db)


@router.get("/context/daily_plan")
def get_daily_plan_context(
    plan_date: date | None = Query(None, description="日期，默认今天"),
    available_minutes: int | None = Query(None, description="可用分钟，默认配置"),
    db: Session = Depends(get_db),
):
    """
    每日规划的 LLM 上下文（系统已选今日待办 + 可用时长）。
    可与用户「其他安排」一起交给大模型，做动态一日规划。
    """
    plan_date = plan_date or date.today()
    minutes = available_minutes if available_minutes is not None else settings.daily_available_minutes
    return daily_plan_to_llm_context(plan_date, minutes, db)


@router.post("/build_daily_prompt", response_model=BuildDailyPromptResponse)
def post_build_daily_prompt(body: BuildDailyPromptRequest, db: Session = Depends(get_db)):
    """
    根据「今日待办」与用户输入的「其他安排」组装 system_prompt 与 user_prompt。
    调用方将返回的 system_prompt / user_prompt 发给自己的大模型 chat 接口即可。
    """
    plan_date = body.plan_date or date.today()
    minutes = body.available_minutes if body.available_minutes is not None else settings.daily_available_minutes
    context = daily_plan_to_llm_context(plan_date, minutes, db)
    result = build_daily_prompt(context, body.other_arrangements)
    return BuildDailyPromptResponse(**result)
