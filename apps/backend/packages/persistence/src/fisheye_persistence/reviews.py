"""Append-only, development-only analyst review records."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from fisheye_persistence.datasets import Base


class FindingReviewRecord(Base):
    __tablename__ = "finding_reviews"
    __table_args__ = (
        CheckConstraint(
            "decision IN ('under_review', 'reviewed_benign', 'escalated')",
            name="ck_finding_reviews_decision",
        ),
        Index("ix_finding_reviews_finding_created", "run_id", "finding_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(
        ForeignKey("evaluation_runs.id", ondelete="RESTRICT"), nullable=False
    )
    finding_id: Mapped[str] = mapped_column(String(512), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_label: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def create_finding_review(
    session: Session,
    *,
    run_id: str,
    finding_id: str,
    decision: str,
    note: str | None,
) -> FindingReviewRecord:
    """Append a review event without changing the run or its findings."""
    record = FindingReviewRecord(
        run_id=run_id,
        finding_id=finding_id,
        decision=decision,
        note=note,
        reviewer_label="Local development user (not authenticated)",
        created_at=datetime.now(UTC),
    )
    session.add(record)
    session.commit()
    return record


def list_finding_reviews(
    session: Session, *, run_id: str, finding_id: str
) -> list[FindingReviewRecord]:
    """Return review history in chronological order."""
    return list(
        session.scalars(
            select(FindingReviewRecord)
            .where(
                FindingReviewRecord.run_id == run_id,
                FindingReviewRecord.finding_id == finding_id,
            )
            .order_by(FindingReviewRecord.created_at, FindingReviewRecord.id)
        )
    )
