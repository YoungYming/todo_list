from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.schemas.daily import TodayResponse, TodayTaskItem
from app.services.scheduler import build_today_plan

router = APIRouter(tags=["daily"])


@router.get("/today", response_model=TodayResponse)
def get_today(
    plan_date: date | None = Query(None, description="日期，默认今天"),
    available_minutes: int | None = Query(None, description="当日可用分钟数，默认取配置"),
    db: Session = Depends(get_db),
):
    """
    今日待办：按「最早截止→优先级→创建时间」在可用时长内选取任务，
    返回可勾选列表及选择理由。
    """
    plan_date = plan_date or date.today()
    minutes = available_minutes if available_minutes is not None else settings.daily_available_minutes
    tasks, reason = build_today_plan(plan_date, minutes, db, save_to_daily_plan=True)
    return TodayResponse(
        plan_date=plan_date,
        available_minutes=minutes,
        tasks=[TodayTaskItem(id=t.id, epic_id=t.epic_id, title=t.title, est_minutes=t.est_minutes, due_date=t.due_date) for t in tasks],
        selection_reason=reason,
    )
