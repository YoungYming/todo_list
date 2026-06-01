from datetime import date, datetime
from sqlalchemy import String, Text, Integer, Date, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Epic(Base):
    __tablename__ = "epics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=3)  # 1–5
    velocity_estimator_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0.0–1.0，按子任务 weight/工时加权已完成占比
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="epic", cascade="all, delete-orphan")
