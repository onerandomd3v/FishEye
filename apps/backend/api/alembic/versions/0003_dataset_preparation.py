"""Track preparation of analytical dataset artifacts.

Revision ID: 0003_dataset_preparation
Revises: 0002_datasets
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_dataset_preparation"
down_revision: str | None = "0002_datasets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "datasets",
        sa.Column(
            "preparation_status",
            sa.String(length=32),
            server_default="source_only",
            nullable=False,
        ),
    )
    op.add_column("datasets", sa.Column("analysis_artifact_uri", sa.Text(), nullable=True))
    op.add_column(
        "datasets", sa.Column("analysis_manifest_sha256", sa.String(length=64), nullable=True)
    )
    op.create_check_constraint(
        "ck_datasets_preparation_status",
        "datasets",
        "preparation_status IN ('source_only', 'prepared')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_datasets_preparation_status", "datasets", type_="check")
    op.drop_column("datasets", "analysis_manifest_sha256")
    op.drop_column("datasets", "analysis_artifact_uri")
    op.drop_column("datasets", "preparation_status")
