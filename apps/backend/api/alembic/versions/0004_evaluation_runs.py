"""Persist durable synthetic evaluation runs and worker leases.

Revision ID: 0004_evaluation_runs
Revises: 0003_dataset_preparation
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_evaluation_runs"
down_revision: str | None = "0003_dataset_preparation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "evaluation_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_sha256", sa.String(length=64), nullable=False),
        sa.Column("context_artifact_uri", sa.Text(), nullable=False),
        sa.Column("context_sha256", sa.String(length=64), nullable=False),
        sa.Column("methodology_version", sa.String(length=96), nullable=False),
        sa.Column("config_sha256", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_owner", sa.String(length=128), nullable=True),
        sa.Column("lease_token", sa.String(length=36), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("metrics_json", sa.JSON(), nullable=True),
        sa.Column("result_artifact_uri", sa.Text(), nullable=True),
        sa.Column("result_manifest_sha256", sa.String(length=64), nullable=True),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed')",
            name="ck_evaluation_runs_status",
        ),
        sa.CheckConstraint("attempt_count >= 0", name="ck_evaluation_runs_attempt_count"),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], name="fk_evaluation_runs_dataset"),
        sa.PrimaryKeyConstraint("id", name="pk_evaluation_runs"),
        sa.UniqueConstraint("idempotency_key", name="uq_evaluation_runs_idempotency_key"),
    )
    op.create_index("ix_evaluation_runs_dataset_id", "evaluation_runs", ["dataset_id"])
    op.create_index(
        "ix_evaluation_runs_status_available",
        "evaluation_runs",
        ["status", "available_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_evaluation_runs_status_available", table_name="evaluation_runs")
    op.drop_index("ix_evaluation_runs_dataset_id", table_name="evaluation_runs")
    op.drop_table("evaluation_runs")
