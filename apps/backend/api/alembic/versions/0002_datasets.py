"""Persist synthetic dataset import metadata.

Revision ID: 0002_datasets
Revises: 0001_initial
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_datasets"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.String(length=64), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("employee_day_count", sa.Integer(), nullable=False),
        sa.Column("artifact_uri", sa.Text(), nullable=False),
        sa.Column("manifest_uri", sa.Text(), nullable=False),
        sa.Column("manifest_sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("row_count > 0", name="ck_datasets_row_count_positive"),
        sa.CheckConstraint(
            "employee_day_count > 0", name="ck_datasets_employee_day_count_positive"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_datasets"),
        sa.UniqueConstraint("sha256", name="uq_datasets_sha256"),
    )


def downgrade() -> None:
    op.drop_table("datasets")
