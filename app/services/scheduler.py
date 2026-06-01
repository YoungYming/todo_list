"""
每日调度器：从未完成且依赖已满足的 Task 中，按「紧迫度」综合评分排序
（基础优先级 + 截止压力 + 临近截止且进度低的加成），在可用时长内装箱，生成当日待办列表。

紧迫度（urgency）设计：
    base      = epic.priority / 5                      基础优先级（0~1）
    days_left = (task.due_date 或 epic.due_date) - 今天  无截止日视为很远
    pressure  = 截止压力：逾期 → overdue_pressure；否则 max(0, (H - days_left)/H)
    gap       = 1 - epic.progress                       未完成度（进度越低越大）
    urgency   = w1*base + w2*pressure + w3*(pressure*gap)
其中 (pressure*gap) 即「临近截止 且 进度低 → 拉高优先级」。
"""
from datetime import date

from sqlalchemy.orm import Session

from app.config import settings
from app.models.task import Task
from app.models.epic import Epic
from app.models.daily_plan import DailyPlan


def _done_task_ids(db: Session) -> set[int]:
    """当前已完成的 task id 集合。"""
    rows = db.query(Task.id).filter(Task.status == "done").all()
    return {r[0] for r in rows}


def _dependency_satisfied(task: Task, done_ids: set[int]) -> bool:
    """该任务的依赖是否均已完成。"""
    dep = task.dependency_task_ids
    if not dep or not isinstance(dep, list):
        return True
    return all(did in done_ids for did in dep)


def compute_urgency(task: Task, epic: Epic | None, plan_date: date) -> float:
    """计算单个任务的紧迫度评分（越大越紧迫）。"""
    priority = epic.priority if epic and epic.priority else 3
    base = max(1, min(5, priority)) / 5.0

    horizon = max(1, settings.schedule_horizon_days)
    due = task.due_date or (epic.due_date if epic else None)
    if due is None:
        pressure = 0.0
    else:
        days_left = (due - plan_date).days
        if days_left < 0:
            pressure = settings.urgency_overdue_pressure
        else:
            pressure = max(0.0, (horizon - days_left) / horizon)

    progress = float(epic.progress) if epic and epic.progress is not None else 0.0
    gap = max(0.0, 1.0 - progress)

    return (
        settings.urgency_w_priority * base
        + settings.urgency_w_deadline * pressure
        + settings.urgency_w_gap * (pressure * gap)
    )


def build_today_plan(
    plan_date: date,
    available_minutes: int,
    db: Session,
    *,
    save_to_daily_plan: bool = True,
    pinned_task_ids: list[int] | None = None,
) -> tuple[list[Task], str]:
    """
    生成当日计划：未完成 + 依赖已满足，按「紧迫度」降序排序，在可用时长内装箱。
    - pinned_task_ids 中的任务为「人工锁定的今日必做」，始终置顶且不受时长限制；
      其余按紧迫度自动补满剩余可用时长。
    返回 (选中任务列表, 选择理由文本)。
    """
    pinned_ids = set(pinned_task_ids or [])
    done_ids = _done_task_ids(db)
    candidates = db.query(Task).filter(Task.status != "done").all()
    candidates = [t for t in candidates if _dependency_satisfied(t, done_ids)]

    epic_ids = {t.epic_id for t in candidates}
    epics = {e.id: e for e in db.query(Epic).filter(Epic.id.in_(epic_ids)).all()}

    def urgency_of(t: Task) -> float:
        return compute_urgency(t, epics.get(t.epic_id), plan_date)

    # 排序：紧迫度降序 → 截止日早 → 创建早
    def sort_key(t: Task):
        return (
            -urgency_of(t),
            0 if t.due_date is not None else 1,
            t.due_date or date.max,
            t.created_at,
        )

    candidates.sort(key=sort_key)

    # 锁定任务始终入选并置顶；其余按紧迫度装箱填满剩余时长
    pinned = [t for t in candidates if t.id in pinned_ids]
    rest = [t for t in candidates if t.id not in pinned_ids]

    selected: list[Task] = list(pinned)
    total_minutes = sum(t.est_minutes for t in pinned)
    for t in rest:
        if total_minutes + t.est_minutes <= available_minutes:
            selected.append(t)
            total_minutes += t.est_minutes

    reason_parts = [
        f"按「紧迫度（优先级+截止压力+临近且进度低加成）」排序，"
        f"锁定 {len(pinned)} 项、自动选取 {len(selected) - len(pinned)} 项，共 {total_minutes} 分钟（可用 {available_minutes} 分钟）。"
    ]
    if selected:
        reason_parts.append("任务：" + "、".join(t.title[:20] + ("…" if len(t.title) > 20 else "") for t in selected))
    selection_reason = " ".join(reason_parts)

    if save_to_daily_plan:
        plan = db.query(DailyPlan).filter(DailyPlan.plan_date == plan_date).first()
        task_ids = [t.id for t in selected]
        if plan:
            plan.task_ids = task_ids
            plan.available_minutes = available_minutes
            plan.selection_reason = selection_reason
        else:
            plan = DailyPlan(
                plan_date=plan_date,
                task_ids=task_ids,
                available_minutes=available_minutes,
                selection_reason=selection_reason,
            )
            db.add(plan)
        db.commit()

    return selected, selection_reason
