from datetime import date, datetime

from sqlalchemy import Integer, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class DailyPin(Base):
    """今日锁定：人工钉到某天「今日必做」的子任务（白板=后端锁定项）。"""

    __tablename__ = "daily_pins"
    __table_args__ = (
        UniqueConstraint("plan_date", "task_id", name="uq_daily_pin_date_task"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plan_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
