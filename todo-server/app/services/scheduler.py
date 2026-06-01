"""
每日调度器：从未完成且依赖已满足的 Task 中，按「最早截止 → 更高优先级 → 较早创建」排序，
在可用时长内截断，生成当日待办列表；可写入 DailyPlan。
"""
from datetime import date

from sqlalchemy.orm import Session

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


def build_today_plan(
    plan_date: date,
    available_minutes: int,
    db: Session,
    *,
    save_to_daily_plan: bool = True,
) -> tuple[list[Task], str]:
    """
    生成当日计划：未完成 + 依赖已满足，按截止日、优先级、创建时间排序，在可用时长内截断。
    返回 (选中任务列表, 选择理由文本)。
    若 save_to_daily_plan 为 True，则写入或更新 DailyPlan。
    """
    done_ids = _done_task_ids(db)
    # 未完成的任务
    candidates = db.query(Task).filter(Task.status != "done").all()
    # 过滤：依赖已满足
    candidates = [t for t in candidates if _dependency_satisfied(t, done_ids)]

    # 加载 Epic 以取 priority
    epic_ids = {t.epic_id for t in candidates}
    epics = {e.id: e for e in db.query(Epic).filter(Epic.id.in_(epic_ids)).all()}
    def priority_of(t: Task) -> int:
        return epics[t.epic_id].priority if t.epic_id in epics else 3

    # 排序：最早截止 → 更高优先级 → 较早创建（due_date 空放最后）
    def sort_key(t: Task):
        due = t.due_date
        return (
            0 if due is not None else 1,
            due or date.max,
            -priority_of(t),
            t.created_at,
        )

    candidates.sort(key=sort_key)

    # 在可用时长内截断
    selected: list[Task] = []
    total_minutes = 0
    for t in candidates:
        if total_minutes + t.est_minutes <= available_minutes:
            selected.append(t)
            total_minutes += t.est_minutes
        else:
            # 不能因单个任务超时长就提前结束；继续尝试后续更短任务
            continue

    reason_parts = [
        f"按「最早截止→优先级→创建时间」排序，在 {available_minutes} 分钟内选取 {len(selected)} 项，共 {total_minutes} 分钟。"
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
