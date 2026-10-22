"""Durable login throttling records for the shared demo account."""

from __future__ import annotations

from sqlalchemy import BigInteger, String, case, delete, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Mapped, Session, mapped_column

from fisheye_persistence.datasets import Base


class LoginAttemptWindow(Base):
    __tablename__ = "login_attempt_windows"

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    failures: Mapped[int] = mapped_column(BigInteger, nullable=False)
    window_started_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    blocked_until: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


def login_blocked_until(session: Session, key_hash: str, *, now: int) -> int:
    """Return the active lockout expiry, or zero when the key can try again."""
    row = session.get(LoginAttemptWindow, key_hash)
    if row is None:
        return 0
    if row.window_started_at <= now - 900:
        session.delete(row)
        session.commit()
        return 0
    return row.blocked_until if row.blocked_until > now else 0


def prune_login_attempts(session: Session, *, now: int) -> None:
    """Remove expired throttle rows so arbitrary client IPs cannot grow the table forever."""
    session.execute(
        delete(LoginAttemptWindow).where(LoginAttemptWindow.window_started_at <= now - 86_400)
    )
    session.commit()


def record_login_failure(
    session: Session,
    key_hash: str,
    *,
    now: int,
    max_failures: int = 5,
    window_seconds: int = 900,
    lockout_seconds: int = 900,
) -> int:
    """Atomically add a failure and return the resulting lockout expiry."""
    row = LoginAttemptWindow.__table__
    within_window = row.c.window_started_at > now - window_seconds
    next_failures = case((within_window, row.c.failures + 1), else_=1)
    next_block = case(
        (next_failures >= max_failures, now + lockout_seconds),
        (within_window, row.c.blocked_until),
        else_=0,
    )
    insert = postgres_insert if session.get_bind().dialect.name == "postgresql" else sqlite_insert
    statement = insert(LoginAttemptWindow).values(
        key_hash=key_hash,
        failures=1,
        window_started_at=now,
        blocked_until=0,
    )
    statement = statement.on_conflict_do_update(
        index_elements=[LoginAttemptWindow.key_hash],
        set_={
            "failures": next_failures,
            "window_started_at": case((within_window, row.c.window_started_at), else_=now),
            "blocked_until": next_block,
        },
    )
    session.execute(statement)
    session.commit()
    return (
        session.scalar(
            select(LoginAttemptWindow.blocked_until).where(LoginAttemptWindow.key_hash == key_hash)
        )
        or 0
    )


def clear_login_failures(session: Session, key_hashes: list[str]) -> None:
    """Clear lockout counters after a successful sign-in."""
    if key_hashes:
        session.execute(
            delete(LoginAttemptWindow).where(LoginAttemptWindow.key_hash.in_(key_hashes))
        )
        session.commit()
