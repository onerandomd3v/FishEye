import json

import pytest
from fisheye_domain.context import CONTEXT_SCHEMA_VERSION, parse_synthetic_context


def context_bytes() -> bytes:
    return json.dumps(
        {
            "schema_version": CONTEXT_SCHEMA_VERSION,
            "roles": [{"role_id": "teller", "authorized_systems": ["core", "crm"]}],
            "employee_schedules": [
                {
                    "employee_id": "employee-1",
                    "timezone": "Africa/Lagos",
                    "working_weekdays": [0, 1, 2, 3, 4],
                    "work_start_local": "08:00",
                    "work_end_local": "17:00",
                }
            ],
        }
    ).encode()


def test_parses_versioned_synthetic_role_and_schedule_context() -> None:
    context = parse_synthetic_context(context_bytes())

    assert context.roles["teller"].authorized_systems == {"core", "crm"}
    schedule = context.employee_schedules["employee-1"]
    assert schedule.timezone == "Africa/Lagos"
    assert schedule.is_working_time(0, schedule.work_start)
    assert not schedule.is_working_time(0, schedule.work_end)


def test_supports_overnight_work_schedules() -> None:
    payload = json.loads(context_bytes())
    payload["employee_schedules"][0]["work_start_local"] = "22:00"
    payload["employee_schedules"][0]["work_end_local"] = "06:00"
    schedule = parse_synthetic_context(json.dumps(payload).encode()).employee_schedules[
        "employee-1"
    ]

    assert schedule.is_working_time(0, schedule.work_start)
    assert not schedule.is_working_time(0, schedule.work_end)
    assert not schedule.is_working_time(0, schedule.work_end.replace(hour=12))
    # Tuesday morning belongs to Monday's shift, but Monday morning belongs to Sunday.
    assert schedule.is_working_time(1, schedule.work_end.replace(hour=2))
    assert not schedule.is_working_time(0, schedule.work_end.replace(hour=2))


@pytest.mark.parametrize("field,value", [("timezone", "Mars/Olympus"), ("work_start_local", "8am")])
def test_rejects_invalid_schedule_metadata(field: str, value: str) -> None:
    payload = json.loads(context_bytes())
    payload["employee_schedules"][0][field] = value

    with pytest.raises(ValueError):
        parse_synthetic_context(json.dumps(payload).encode())
