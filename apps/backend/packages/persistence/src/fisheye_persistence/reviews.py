"""Append-only, development-only analyst review records."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from hashlib import sha256
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func, select
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
    reviewer_label: str = "Local development user (not authenticated)",
) -> FindingReviewRecord:
    """Append a review event without changing the run or its findings."""
    if len(reviewer_label) > 128:
        digest = sha256(reviewer_label.encode("utf-8")).hexdigest()[:12]
        reviewer_label = f"{reviewer_label[:115]}:{digest}"
    record = FindingReviewRecord(
        run_id=run_id,
        finding_id=finding_id,
        decision=decision,
        note=note,
        reviewer_label=reviewer_label,
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


def list_finding_review_history(
    session: Session,
    *,
    limit: int,
    offset: int,
    decision: str | None = None,
    search: str | None = None,
    recorded_on: date | None = None,
) -> tuple[list[FindingReviewRecord], int]:
    """Return a newest-first, paginated workspace review history."""
    statement = select(FindingReviewRecord)
    count_statement = select(func.count()).select_from(FindingReviewRecord)
    if decision is not None:
        statement = statement.where(FindingReviewRecord.decision == decision)
        count_statement = count_statement.where(FindingReviewRecord.decision == decision)
    if search:
        pattern = f"%{search}%"
        matching = (
            FindingReviewRecord.finding_id.ilike(pattern)
            | FindingReviewRecord.reviewer_label.ilike(pattern)
            | FindingReviewRecord.note.ilike(pattern)
        )
        statement = statement.where(matching)
        count_statement = count_statement.where(matching)
    if recorded_on is not None:
        day_start = datetime.combine(recorded_on, time.min, tzinfo=UTC)
        next_day = day_start + timedelta(days=1)
        date_filter = (FindingReviewRecord.created_at >= day_start) & (
            FindingReviewRecord.created_at < next_day
        )
        statement = statement.where(date_filter)
        count_statement = count_statement.where(date_filter)

    total = session.scalar(count_statement) or 0
    items = list(
        session.scalars(
            statement.order_by(
                FindingReviewRecord.created_at.desc(), FindingReviewRecord.id.desc()
            )
            .limit(limit)
            .offset(offset)
        )
    )
    return items, total


def list_latest_finding_reviews(
    session: Session, *, run_id: str, finding_ids: list[str]
) -> dict[str, FindingReviewRecord]:
    """Return the newest review event for each finding in one run."""
    if not finding_ids:
        return {}
    reviews = session.scalars(
        select(FindingReviewRecord)
        .where(
            FindingReviewRecord.run_id == run_id,
            FindingReviewRecord.finding_id.in_(finding_ids),
        )
        .order_by(FindingReviewRecord.created_at, FindingReviewRecord.id)
    )
    latest: dict[str, FindingReviewRecord] = {}
    for review in reviews:
        latest[review.finding_id] = review
    return latest
