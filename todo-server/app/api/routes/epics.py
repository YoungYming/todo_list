from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.epic import Epic
from app.models.split_decision import SplitDecision
from app.models.task import Task
from app.schemas.epic import EpicCreate, EpicRead, EpicUpdate
from app.schemas.split import SplitCandidateSetRead, SplitDecisionCreate
from app.schemas.task import TaskRead
from app.services.split.service import generate_and_store_candidates, apply_split_decision

router = APIRouter(prefix="/epics", tags=["epics"])


@router.get("", response_model=list[EpicRead])
def list_epics(db: Session = Depends(get_db)):
    """列出所有 Epic。"""
    epics = db.query(Epic).order_by(Epic.created_at.desc()).all()
    return epics


@router.get("/{epic_id}/split_candidates", response_model=list[SplitCandidateSetRead])
def get_split_candidates(epic_id: int, db: Session = Depends(get_db)):
    """获取该 Epic 的拆分候选（多套）。生成并落库后返回。"""
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    sets = generate_and_store_candidates(epic_id, db)
    return sets


@router.post("/{epic_id}/split_decision", status_code=201)
def post_split_decision(epic_id: int, body: SplitDecisionCreate, db: Session = Depends(get_db)):
    """提交最终拆分：按 final_tasks_json 创建子任务并写入 SplitDecision。一次性提交，已有决策则 409。"""
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    existing = db.query(SplitDecision).filter(SplitDecision.epic_id == epic_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Epic split decision already submitted")
    raw = [t.model_dump() for t in body.final_tasks_json]
    tasks = apply_split_decision(
        epic_id,
        chosen_candidate_set_id=body.chosen_candidate_set_id,
        final_tasks_json=raw,
        edits_diff=body.edits_diff,
        db=db,
    )
    return {"epic_id": epic_id, "task_count": len(tasks), "task_ids": [t.id for t in tasks]}


@router.get("/{epic_id}/tasks", response_model=list[TaskRead])
def list_epic_tasks(epic_id: int, db: Session = Depends(get_db)):
    """查看某 Epic 下的子任务列表，便于验证拆分结果。"""
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    tasks = db.query(Task).filter(Task.epic_id == epic_id).order_by(Task.id).all()
    return tasks


@router.get("/{epic_id}", response_model=EpicRead)
def get_epic(epic_id: int, db: Session = Depends(get_db)):
    """获取单个 Epic。"""
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    return epic


@router.post("", response_model=EpicRead, status_code=201)
def create_epic(body: EpicCreate, db: Session = Depends(get_db)):
    """创建 Epic。"""
    epic = Epic(
        title=body.title,
        description=body.description,
        start_date=body.start_date,
        due_date=body.due_date,
        priority=body.priority,
    )
    db.add(epic)
    db.commit()
    db.refresh(epic)
    return epic


@router.patch("/{epic_id}", response_model=EpicRead)
def update_epic(epic_id: int, body: EpicUpdate, db: Session = Depends(get_db)):
    """更新 Epic（截止日/描述/优先级等）。"""
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")

    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(epic, k, v)

    db.add(epic)
    db.commit()
    db.refresh(epic)
    return epic


@router.delete("/{epic_id}", status_code=204)
def delete_epic(epic_id: int, db: Session = Depends(get_db)):
    """删除 Epic（级联删除其 Task/拆分记录）。"""
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    db.delete(epic)
    db.commit()
    return None
