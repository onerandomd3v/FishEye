"""Label-free employee-day inputs and evaluation-only ground truth contracts."""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum


class GroundTruthLabel(StrEnum):
    """Evaluation labels; never include these values in detector inputs."""

    THREAT = "threat_scenario"
    BENIGN = "benign_scenario"


@dataclass(frozen=True, order=True)
class EmployeeDayKey:
    """Stable key for one synthetic employee on one UTC calendar day."""

    employee_id: str
    day_utc: date


@dataclass(frozen=True)
class EmployeeDayInput:
    """Detector-visible event summary, intentionally free of split and label fields."""

    key: EmployeeDayKey
    role_ids: tuple[str, ...]
    department_ids: tuple[str, ...]
    event_ids: tuple[str, ...]
    event_types: tuple[str, ...]
    systems: tuple[str, ...]
    device_ids: tuple[str, ...]
    location_labels: tuple[str, ...]
    record_count_total: int
    first_event_time_utc: str
    last_event_time_utc: str


@dataclass(frozen=True)
class EmployeeDayTruth:
    """Evaluation-only label and optional real scenario metadata."""

    key: EmployeeDayKey
    label: GroundTruthLabel
    scenario_id: str | None = None
