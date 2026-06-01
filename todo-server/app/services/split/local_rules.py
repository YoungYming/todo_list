"""
本地规则拆分：子任务 25–60 分钟，单任务超过 2 小时必须再拆。
基于标题与描述做启发式切分，无外部调用。
"""
import re
import uuid
from datetime import date

from app.services.split.provider import CandidateTask, SplitCandidateSet

MIN_MINUTES = 25
MAX_MINUTES = 60
MAX_SINGLE_TASK_MINUTES = 120  # 超过则必须拆成多段


def _parse_steps(description: str | None, title: str) -> list[str]:
    """从描述中解析出步骤标题列表；无描述则返回 [title]。"""
    if not (description and description.strip()):
        return [title.strip() or "未命名任务"]
    text = description.strip()
    # 按换行、分号、或 "1. 2. 3." / "步骤1 步骤2" 等切分
    parts = re.split(r"\n+|;\s*|\d+[.)]\s*", text)
    steps = [p.strip() for p in parts if p.strip()]
    if not steps:
        return [title.strip() or "未命名任务"]
    return steps


def _est_for_step(index: int, total: int, epic_due: date | None) -> int:
    """单步预估分钟数，落在 25–60 之间。"""
    base = 45
    if total <= 0:
        return base
    # 简单轮转，避免全部相同
    variants = [30, 45, 60]
    return variants[index % len(variants)]


class LocalRulesProvider:
    """本地规则 Provider：固定规则，无网络。"""

    name = "local_rules"

    def generate(
        self,
        title: str,
        description: str | None,
        start_date: date | None,
        due_date: date | None,
    ) -> SplitCandidateSet:
        steps = _parse_steps(description, title)
        due_str = due_date.isoformat() if due_date else None
        tasks: list[CandidateTask] = []
        for i, step_title in enumerate(steps):
            est = _est_for_step(i, len(steps), due_date)
            if est > MAX_SINGLE_TASK_MINUTES:
                # 单任务不得超过 2h，拆成多段
                n = (est + MAX_MINUTES - 1) // MAX_MINUTES
                for j in range(n):
                    tasks.append(
                        CandidateTask(
                            title=f"{step_title}（第{j+1}/{n}段）",
                            est_minutes=min(MAX_MINUTES, est - j * MAX_MINUTES) or MAX_MINUTES,
                            due_date=due_str,
                            reason="本地规则：单任务超过 2 小时已拆分为多段",
                        )
                    )
            else:
                est = max(MIN_MINUTES, min(MAX_MINUTES, est))
                tasks.append(
                    CandidateTask(
                        title=step_title,
                        est_minutes=est,
                        due_date=due_str,
                        reason="本地规则：按描述步骤拆分，25–60 分钟/步",
                    )
                )
        set_id = f"local_rules_{uuid.uuid4().hex[:12]}"
        return SplitCandidateSet(
            provider_name=self.name,
            candidate_set_id=set_id,
            tasks=tasks,
            score_hint=0.8,
        )
