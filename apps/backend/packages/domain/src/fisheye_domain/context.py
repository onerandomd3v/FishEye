"""Versioned synthetic role and schedule context used by detectors."""

from dataclasses import dataclass
from datetime import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

CONTEXT_SCHEMA_VERSION = "fisheye.context.v1"


@dataclass(frozen=True)
class RoleContext:
    role_id: str
    authorized_systems: frozenset[str]


@dataclass(frozen=True)
class EmployeeSchedule:
    employee_id: str
    timezone: str
    working_weekdays: frozenset[int]
    work_start: time
    work_end: time

    def is_working_time(self, weekday: int, local_time: time) -> bool:
        """Return whether a local timestamp falls in the employee's declared shift."""
        if self.work_start <= self.work_end:
            return (
                weekday in self.working_weekdays and self.work_start <= local_time < self.work_end
            )
        if local_time >= self.work_start:
            return weekday in self.working_weekdays
        previous_weekday = (weekday - 1) % 7
        return local_time < self.work_end and previous_weekday in self.working_weekdays


@dataclass(frozen=True)
class SyntheticContext:
    schema_version: str
    roles: dict[str, RoleContext]
    employee_schedules: dict[str, EmployeeSchedule]


def parse_synthetic_context(content: bytes) -> SyntheticContext:
    """Parse a context sidecar; reject malformed or incomplete mappings safely."""
    import json

    try:
        data = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("Context file must be valid UTF-8 JSON.") from None
    if not isinstance(data, dict) or data.get("schema_version") != CONTEXT_SCHEMA_VERSION:
        raise ValueError(f"Context file must use {CONTEXT_SCHEMA_VERSION}.")
    if set(data) != {"schema_version", "roles", "employee_schedules"}:
        raise ValueError("Context file contains missing or unsupported top-level fields.")

    roles: dict[str, RoleContext] = {}
    role_rows = data["roles"]
    if not isinstance(role_rows, list) or not role_rows:
        raise ValueError("Context file must include at least one role mapping.")
    for row in role_rows:
        if not isinstance(row, dict) or set(row) != {"role_id", "authorized_systems"}:
            raise ValueError("Each role mapping needs role_id and authorized_systems.")
        role_id = _required_string(row["role_id"], "role_id")
        systems = row["authorized_systems"]
        if not isinstance(systems, list) or not systems:
            raise ValueError("Each role needs at least one authorized system.")
        normalized_systems = frozenset(
            _required_string(value, "authorized system") for value in systems
        )
        if len(normalized_systems) != len(systems):
            raise ValueError("Authorized system names must be unique within each role.")
        if role_id in roles:
            raise ValueError("Role identifiers must be unique in the context file.")
        roles[role_id] = RoleContext(role_id, normalized_systems)

    schedules: dict[str, EmployeeSchedule] = {}
    schedule_rows = data["employee_schedules"]
    if not isinstance(schedule_rows, list) or not schedule_rows:
        raise ValueError("Context file must include at least one employee schedule.")
    for row in schedule_rows:
        fields = {
            "employee_id",
            "timezone",
            "working_weekdays",
            "work_start_local",
            "work_end_local",
        }
        if not isinstance(row, dict) or set(row) != fields:
            raise ValueError("Each employee schedule has an invalid set of fields.")
        employee_id = _required_string(row["employee_id"], "employee_id")
        timezone = _required_string(row["timezone"], "timezone")
        try:
            ZoneInfo(timezone)
        except ZoneInfoNotFoundError:
            raise ValueError("Employee schedule has an unknown IANA timezone.") from None
        weekdays = row["working_weekdays"]
        if (
            not isinstance(weekdays, list)
            or not weekdays
            or any(type(day) is not int or day not in range(7) for day in weekdays)
            or len(set(weekdays)) != len(weekdays)
        ):
            raise ValueError("working_weekdays must contain unique integers from 0 to 6.")
        start = _parse_time(row["work_start_local"])
        end = _parse_time(row["work_end_local"])
        if start == end:
            raise ValueError("Work start and end times must differ.")
        if employee_id in schedules:
            raise ValueError("Employee schedule identifiers must be unique.")
        schedules[employee_id] = EmployeeSchedule(
            employee_id=employee_id,
            timezone=timezone,
            working_weekdays=frozenset(weekdays),
            work_start=start,
            work_end=end,
        )
    return SyntheticContext(CONTEXT_SCHEMA_VERSION, roles, schedules)


def _required_string(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string.")
    return value.strip()


def _parse_time(value: object) -> time:
    if not isinstance(value, str):
        raise ValueError("Work times must use HH:MM 24-hour notation.")
    try:
        parsed = time.fromisoformat(value)
    except ValueError:
        raise ValueError("Work times must use HH:MM 24-hour notation.") from None
    if parsed.second or parsed.microsecond or len(value) != 5:
        raise ValueError("Work times must use HH:MM 24-hour notation.")
    return parsed
