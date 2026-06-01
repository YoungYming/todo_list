from datetime import date, datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, Date, DateTime, Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.epic import Epic
    from app.models.completion import Completion


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    done = "done"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    epic_id: Mapped[int] = mapped_column(ForeignKey("epics.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    est_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    est_minutes_user: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dependency_task_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [int, ...]
    status: Mapped[str] = mapped_column(String(32), default=TaskStatus.pending.value)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    task_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    avg_actual_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    difficulty_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    output_size_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    epic: Mapped["Epic"] = relationship("Epic", back_populates="tasks")
    completions: Mapped[list["Completion"]] = relationship(
        "Completion", back_populates="task", cascade="all, delete-orphan"
    )
