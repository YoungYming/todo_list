from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.task import Task


class Completion(Base):
    __tablename__ = "completions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    difficulty: Mapped[int] = mapped_column(Integer, default=3)  # 1–5
    actual_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1–5
    task_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship("Task", back_populates="completions")
