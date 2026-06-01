from datetime import date, datetime
from sqlalchemy import Integer, Date, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class DailyPlan(Base):
    __tablename__ = "daily_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plan_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)  # 每日一条
    task_ids: Mapped[list] = mapped_column(JSON, nullable=False)  # [int, ...] 顺序即当日排序
    available_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    selection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
