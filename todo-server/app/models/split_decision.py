from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SplitDecision(Base):
    __tablename__ = "split_decisions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    epic_id: Mapped[int] = mapped_column(ForeignKey("epics.id", ondelete="CASCADE"), nullable=False)
    chosen_candidate_set_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    final_tasks_json: Mapped[list] = mapped_column(JSON, nullable=False)
    edits_diff: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
