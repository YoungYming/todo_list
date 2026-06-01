"""
拆分服务：生成多套候选并落库；提交决策时写入 Task + SplitDecision。

- 当前无差分逻辑：提交决策时为「全量替换」该 Epic 下子任务；真正的差分（只对变更部分
  重新拆分）可后续在比较 Epic 新旧内容后只重算部分 Task。
- 候选生成：当前仅本地规则；大模型接入后实现 SplitProvider，在 generate_and_store_candidates
  的 providers 列表中加入即可。
"""
from datetime import date

from sqlalchemy.orm import Session

from app.models.epic import Epic
from app.models.task import Task
from app.models.split_candidate import SplitCandidate
from app.models.split_decision import SplitDecision
from app.services.epic_progress import recalculate_epic_progress
from app.services.split.local_rules import LocalRulesProvider
from app.services.split.provider import CandidateTask, SplitCandidateSet
from app.services.split.llm_provider import LLMSplitProvider
from app.config import settings

from app.models.task import TaskStatus


def _candidate_set_to_json(st: SplitCandidateSet) -> list[dict]:
    return [
        {
            "title": t.title,
            "est_minutes": t.est_minutes,
            "due_date": t.due_date,
            "reason": t.reason,
        }
        for t in st.tasks
    ]


def generate_and_store_candidates(epic_id: int, db: Session) -> list[dict]:
    """
    为指定 Epic 生成拆分候选并写入 SplitCandidate 表。
    返回列表，每项为 { candidate_set_id, provider_name, tasks, score_hint }。
    """
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        return []

    providers = [LocalRulesProvider()]
    if settings.split_llm_enabled:
        providers.append(LLMSplitProvider())
    result = []
    for prov in providers:
        try:
            st = prov.generate(
                title=epic.title,
                description=epic.description,
                start_date=epic.start_date,
                due_date=epic.due_date,
            )
        except Exception as e:
            print(f"[split] provider {getattr(prov, 'name', type(prov).__name__)} failed: {e}")
            continue
        row = SplitCandidate(
            epic_id=epic_id,
            provider_name=st.provider_name,
            candidate_set_id=st.candidate_set_id,
            tasks_json=_candidate_set_to_json(st),
            score_hint=st.score_hint,
        )
        db.add(row)
        result.append({
            "candidate_set_id": st.candidate_set_id,
            "provider_name": st.provider_name,
            "tasks": [{"title": t.title, "est_minutes": t.est_minutes, "due_date": t.due_date, "reason": t.reason} for t in st.tasks],
            "score_hint": st.score_hint,
        })
    db.commit()
    return result


def apply_split_decision(
    epic_id: int,
    chosen_candidate_set_id: str | None,
    final_tasks_json: list[dict],
    edits_diff: str | None,
    db: Session,
) -> list[Task]:
    """
    提交拆分决策：删除该 Epic 下原有 Task，按 final_tasks_json 创建新 Task，并写入 SplitDecision。
    final_tasks_json 每项至少含 title, est_minutes；可选 due_date, dependency_task_ids 等。
    """
    epic = db.query(Epic).filter(Epic.id == epic_id).first()
    if not epic:
        return []

    # 删除该 Epic 下所有现有子任务（后续可做差分时只删改部分）
    db.query(Task).filter(Task.epic_id == epic_id).delete()

    # 解析 due_date 字符串为 date（若存在）
    def parse_date(s: str | None) -> date | None:
        if not s:
            return None
        try:
            return date.fromisoformat(s) if isinstance(s, str) else s
        except Exception:
            return None

    new_tasks: list[Task] = []
    for item in final_tasks_json:
        title = item.get("title") or "未命名"
        est = int(item.get("est_minutes", 45))
        due = parse_date(item.get("due_date"))
        dep_ids = item.get("dependency_task_ids")  # 新建时尚无 id，可先不设或后续用顺序 id
        t = Task(
            epic_id=epic_id,
            title=title,
            est_minutes=max(1, min(480, est)),  # 合理范围
            due_date=due,
            dependency_task_ids=dep_ids if isinstance(dep_ids, list) else None,
            status=TaskStatus.pending.value,
        )
        db.add(t)
        new_tasks.append(t)

    db.flush()  # 拿到新 task id 若需要可写回 dependency

    decision = SplitDecision(
        epic_id=epic_id,
        chosen_candidate_set_id=chosen_candidate_set_id,
        final_tasks_json=final_tasks_json,
        edits_diff=edits_diff,
    )
    db.add(decision)
    recalculate_epic_progress(epic_id, db)
    db.commit()
    for t in new_tasks:
        db.refresh(t)
    return new_tasks
