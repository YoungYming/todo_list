from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.config import settings


from datetime import date
import json

from fastapi import HTTPException

from app.models.epic import Epic
from app.models.split_decision import SplitDecision
from app.models.task import Task
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
        {"id": t.id, "title": t.title, "est_minutes": t.est_minutes, "due_date": t.due_date.isoformat() if t.due_date else None}
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
    epic_dicts = [
        {
            "id": e.id,
            "title": e.title,
            "description": e.description,
            "due_date": e.due_date.isoformat() if e.due_date else None,
            "progress": getattr(e, "progress", 0.0),
        }
        for e in epics
    ]
    ctx = {"request": request, "epics": epic_dicts}
    ctx.update(_base_ctx())
    return templates.TemplateResponse("epics.html", ctx)


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
