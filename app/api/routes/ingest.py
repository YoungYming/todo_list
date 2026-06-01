"""
图片/文件识别拆解任务。

- POST /ingest/extract：上传文件，大模型识别 → 返回可编辑的「总任务 + 子任务」列表（不入库）。
- POST /ingest/commit ：把用户编辑后的结果创建为 Epic + 子任务（复用拆分落库逻辑）。
"""
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.epic import Epic
from app.schemas.ingest import IngestCommitRequest, IngestExtractResult
from app.services.ingest import (
    IngestError,
    IngestNotConfigured,
    IngestUnsupported,
    extract_tasks_from_file,
)
from app.services.split.service import apply_split_decision

router = APIRouter(prefix="/ingest", tags=["ingest"])

MAX_BYTES = 12 * 1024 * 1024  # 12MB


@router.post("/extract", response_model=IngestExtractResult)
async def extract(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """上传图片/文档，识别出可编辑的任务清单（不入库）。"""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="文件为空")
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="文件过大（上限 12MB）")
    try:
        result = extract_tasks_from_file(file.filename or "", content)
    except IngestNotConfigured as e:
        # 骨架占位：未配置大模型时返回 503，前端给出清晰提示
        raise HTTPException(status_code=503, detail=str(e))
    except IngestUnsupported as e:
        raise HTTPException(status_code=415, detail=str(e))
    except IngestError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:  # 网络/超时等
        raise HTTPException(status_code=502, detail=f"识别失败：{e}")
    return IngestExtractResult(**result)


@router.post("/commit", status_code=201)
def commit(body: IngestCommitRequest, db: Session = Depends(get_db)):
    """把识别并编辑后的结果创建为 Epic + 子任务。"""
    def parse_date(s: str | None):
        if not s:
            return None
        try:
            return date.fromisoformat(s)
        except Exception:
            return None

    epic = Epic(
        title=body.title.strip()[:200],
        description=body.description,
        due_date=parse_date(body.due_date),
        priority=max(1, min(5, body.priority or 3)),
    )
    db.add(epic)
    db.commit()
    db.refresh(epic)

    final_tasks = [
        {
            "title": (t.title or "未命名").strip()[:200],
            "est_minutes": max(1, min(480, t.est_minutes or 45)),
            "due_date": t.due_date,
        }
        for t in body.tasks
    ]
    tasks = apply_split_decision(
        epic.id,
        chosen_candidate_set_id=None,
        final_tasks_json=final_tasks,
        edits_diff="from-ingest",
        db=db,
    )
    return {"epic_id": epic.id, "task_count": len(tasks), "task_ids": [t.id for t in tasks]}
