"""Persist bounded shared-demo login throttling windows.

Revision ID: 0006_login_attempt_windows
Revises: 0005_finding_reviews
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_login_attempt_windows"
down_revision: str | None = "0005_finding_reviews"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "login_attempt_windows",
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("failures", sa.BigInteger(), nullable=False),
        sa.Column("window_started_at", sa.BigInteger(), nullable=False),
        sa.Column("blocked_until", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("key_hash", name="pk_login_attempt_windows"),
    )
    op.create_index(
        "ix_login_attempt_windows_window_started_at",
        "login_attempt_windows",
        ["window_started_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_login_attempt_windows_window_started_at",
        table_name="login_attempt_windows",
    )
    op.drop_table("login_attempt_windows")
