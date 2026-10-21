"""Establish an empty baseline; the MVP has no approved product schema yet.

Revision ID: 0001_initial
Revises:
"""

from collections.abc import Sequence

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Track the initial schema baseline without inventing product tables."""


def downgrade() -> None:
    """Return to an unversioned database; no product tables are created here."""
