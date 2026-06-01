from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings
from app.schemas.daily import PinCreate, PinItem, TodayResponse, TodayTaskItem
from app.services import pins as pins_service
from app.services.scheduler import build_today_plan

router = APIRouter(tags=["daily"])


@router.get("/today", response_model=TodayResponse)
def get_today(
    plan_date: date | None = Query(None, description="日期，默认今天"),
    available_minutes: int | None = Query(None, description="当日可用分钟数，默认取配置"),
    db: Session = Depends(get_db),
):
    """
    今日待办：锁定项（白板）置顶且必选，其余按「紧迫度」在可用时长内自动补满，
    返回可勾选列表及选择理由。
    """
    plan_date = plan_date or date.today()
    minutes = available_minutes if available_minutes is not None else settings.daily_available_minutes
    pinned = pins_service.pinned_task_ids(db, plan_date)
    tasks, reason = build_today_plan(
        plan_date, minutes, db, save_to_daily_plan=True, pinned_task_ids=pinned
    )
    return TodayResponse(
        plan_date=plan_date,
        available_minutes=minutes,
        tasks=[TodayTaskItem(id=t.id, epic_id=t.epic_id, title=t.title, est_minutes=t.est_minutes, due_date=t.due_date) for t in tasks],
        selection_reason=reason,
    )


@router.get("/daily/pins", response_model=list[PinItem])
def list_pins(
    plan_date: date | None = Query(None, description="日期，默认今天"),
    db: Session = Depends(get_db),
):
    """列出当日锁定（白板）的子任务。"""
    plan_date = plan_date or date.today()
    return [PinItem(**x) for x in pins_service.list_pinned_details(db, plan_date)]


@router.post("/daily/pins", response_model=list[PinItem], status_code=201)
def create_pin(
    body: PinCreate,
    plan_date: date | None = Query(None, description="日期，默认今天"),
    db: Session = Depends(get_db),
):
    """锁定今日必做：传 task_id 锁定单条；传 epic_id 锁定其全部未完成子任务。"""
    plan_date = plan_date or date.today()
    if body.task_id is None and body.epic_id is None:
        raise HTTPException(status_code=422, detail="需要 task_id 或 epic_id")
    if body.epic_id is not None:
        pins_service.add_pins_for_epic(db, plan_date, body.epic_id)
    if body.task_id is not None:
        pins_service.add_pin(db, plan_date, body.task_id)
    db.commit()
    return [PinItem(**x) for x in pins_service.list_pinned_details(db, plan_date)]


@router.delete("/daily/pins/{task_id}", response_model=list[PinItem])
def delete_pin(
    task_id: int,
    plan_date: date | None = Query(None, description="日期，默认今天"),
    db: Session = Depends(get_db),
):
    """取消今日锁定。返回剩余锁定项。"""
    plan_date = plan_date or date.today()
    pins_service.remove_pin(db, plan_date, task_id)
    db.commit()
    return [PinItem(**x) for x in pins_service.list_pinned_details(db, plan_date)]
