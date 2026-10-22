"""Store append-only development finding reviews.

Revision ID: 0005_finding_reviews
Revises: 0004_evaluation_runs
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_finding_reviews"
down_revision: str | None = "0004_evaluation_runs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "finding_reviews",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("finding_id", sa.String(length=512), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("reviewer_label", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "decision IN ('under_review', 'reviewed_benign', 'escalated')",
            name="ck_finding_reviews_decision",
        ),
        sa.ForeignKeyConstraint(["run_id"], ["evaluation_runs.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_finding_reviews"),
    )
    op.create_index(
        "ix_finding_reviews_finding_created",
        "finding_reviews",
        ["run_id", "finding_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_finding_reviews_finding_created", table_name="finding_reviews")
    op.drop_table("finding_reviews")
