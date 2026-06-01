from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SplitCandidate(Base):
    __tablename__ = "split_candidates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    epic_id: Mapped[int] = mapped_column(ForeignKey("epics.id", ondelete="CASCADE"), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(64), nullable=False)
    candidate_set_id: Mapped[str] = mapped_column(String(64), nullable=False)
    tasks_json: Mapped[list] = mapped_column(JSON, nullable=False)  # list of {title, est_minutes, due, reason?}
    score_hint: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
