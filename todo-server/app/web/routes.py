from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings


from datetime import date, datetime, timedelta
import calendar
import json

from fastapi import HTTPException

from app.models.epic import Epic
from app.models.split_decision import SplitDecision
from app.models.task import Task
from app.models.completion import Completion
from app.services.scheduler import build_today_plan


def _base_ctx():
    """所有页面共用的模板上下文（API 基础路径等）。"""
    return {"api_base_path": settings.api_base_path or ""}

router = APIRouter(tags=["web"])
_templates_dir = Path(__file__).resolve().parent / "templates"
templates = Jinja2Templates(directory=str(_templates_dir))


@router.get("/app", response_class=HTMLResponse)
def page_today(request: Request, db: Session = Depends(get_db)):
    """今日待办页：列表 + 完成按钮（弹窗提交反馈）。"""
    plan_date = date.today()
    minutes = settings.daily_available_minutes
    tasks, reason = build_today_plan(plan_date, minutes, db, save_to_daily_plan=True)
    task_dicts = [
        {
            "id": t.id,
            "epic_id": t.epic_id,
            "title": t.title,
            "est_minutes": t.est_minutes,
            "due_date": t.due_date.isoformat() if t.due_date else None,
        }
        for t in tasks
    ]
    today_json = json.dumps(task_dicts, ensure_ascii=False)
    ctx = {
        "request": request,
        "plan_date": plan_date.isoformat(),
        "available_minutes": minutes,
        "tasks": task_dicts,
        "selection_reason": reason,
        "today_json": today_json,
    }
    ctx.update(_base_ctx())
    return templates.TemplateResponse("today.html", ctx)


@router.get("/app/epics", response_class=HTMLResponse)
def page_epics(request: Request, db: Session = Depends(get_db)):
    """Epic 列表页 + 创建表单。"""
    epics = db.query(Epic).order_by(Epic.created_at.desc()).all()
    epic_ids = [e.id for e in epics]
    tasks_by_epic: dict[int, list[dict]] = {eid: [] for eid in epic_ids}
    if epic_ids:
        tasks = db.query(Task).filter(Task.epic_id.in_(epic_ids)).order_by(Task.id.asc()).all()
        for t in tasks:
            tasks_by_epic.setdefault(t.epic_id, []).append({
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "est_minutes": t.est_minutes,
                "due_date": t.due_date.isoformat() if t.due_date else None,
            })

    epic_dicts = [
        {
            "id": e.id,
            "title": e.title,
            "description": e.description,
            "due_date": e.due_date.isoformat() if e.due_date else None,
            "progress": getattr(e, "progress", 0.0),
            "tasks": tasks_by_epic.get(e.id, []),
        }
        for e in epics
    ]
    ctx = {"request": request, "epics": epic_dicts}
    ctx.update(_base_ctx())
    return templates.TemplateResponse("epics.html", ctx)


@router.get("/app/history", response_class=HTMLResponse)
def page_history(
    request: Request,
    selected_date: str | None = None,
    month: str | None = None,
    db: Session = Depends(get_db),
):
    """历史任务页：按日历查看完成记录。"""
    today = date.today()

    if month:
        try:
            y, m = map(int, month.split("-"))
            month_date = date(y, m, 1)
        except Exception:
            month_date = date(today.year, today.month, 1)
    else:
        month_date = date(today.year, today.month, 1)

    if selected_date:
        try:
            focus_date = date.fromisoformat(selected_date)
        except Exception:
            focus_date = today
    else:
        focus_date = today

    month_start = month_date
    _, days_in_month = calendar.monthrange(month_start.year, month_start.month)
    month_end = month_start + timedelta(days=days_in_month)

    rows = (
        db.query(Completion, Task, Epic)
        .join(Task, Completion.task_id == Task.id)
        .join(Epic, Task.epic_id == Epic.id)
        .filter(Completion.completed_at >= datetime.combine(month_start, datetime.min.time()))
        .filter(Completion.completed_at < datetime.combine(month_end, datetime.min.time()))
        .order_by(Completion.completed_at.desc())
        .all()
    )

    day_map: dict[str, list[dict]] = {}
    for c, t, e in rows:
        d = c.completed_at.date().isoformat()
        day_map.setdefault(d, []).append(
            {
                "task_id": t.id,
                "task_title": t.title,
                "epic_id": e.id,
                "epic_title": e.title,
                "completed_at": c.completed_at.strftime("%H:%M"),
                "actual_minutes": c.actual_minutes,
            }
        )

    cal_weeks = calendar.monthcalendar(month_start.year, month_start.month)
    cells = []
    for wk in cal_weeks:
        row = []
        for d in wk:
            if d == 0:
                row.append(None)
                continue
            ds = date(month_start.year, month_start.month, d).isoformat()
            row.append({"date": ds, "day": d, "count": len(day_map.get(ds, []))})
        cells.append(row)

    selected_tasks = day_map.get(focus_date.isoformat(), [])

    ctx = {
        "request": request,
        "month": month_start.strftime("%Y-%m"),
        "focus_date": focus_date.isoformat(),
        "calendar_rows": cells,
        "selected_tasks": selected_tasks,
    }
    ctx.update(_base_ctx())
    return templates.TemplateResponse("history.html", ctx)


@router.get("/app/epics/{epic_id}", response_class=HTMLResponse)
def page_epic_detail(request: Request, epic_id: int, db: Session = Depends(get_db)):
    """Epic 详情页：子任务列表。"""
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    tasks = db.query(Task).filter(Task.epic_id == epic_id).order_by(Task.id).all()
    task_dicts = [
        {"id": t.id, "title": t.title, "est_minutes": t.est_minutes, "status": t.status}
        for t in tasks
    ]
    has_split_decision = db.query(SplitDecision).filter(SplitDecision.epic_id == epic_id).first() is not None
    ctx = {
        "request": request,
        "epic": {
            "id": epic.id,
            "title": epic.title,
            "description": epic.description,
            "due_date": epic.due_date.isoformat() if epic.due_date else None,
            "progress": getattr(epic, "progress", 0.0),
        },
        "tasks": task_dicts,
        "epic_id": epic_id,
        "has_split_decision": has_split_decision,
    }
    ctx.update(_base_ctx())
    return templates.TemplateResponse("epic_detail.html", ctx)
