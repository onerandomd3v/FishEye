from fastapi.testclient import TestClient
from fisheye_api.csv_validation import CSV_HEADERS, validate_events_csv
from fisheye_api.main import app


def make_csv(*rows: tuple[str, ...], headers: tuple[str, ...] = CSV_HEADERS) -> bytes:
    return (",".join(headers) + "\n" + "\n".join(",".join(row) for row in rows)).encode()


def baseline_row(event_id: str, event_time: str) -> tuple[str, ...]:
    return (
        event_id,
        "emp-test-1",
        "role-test-1",
        "dept-test-1",
        event_time,
        "sign_in",
        "synthetic-core-system",
        "",
        "",
        "",
        "baseline",
        "",
    )


def evaluation_row(event_id: str, event_time: str, label: str) -> tuple[str, ...]:
    return (
        event_id,
        "emp-test-1",
        "role-test-1",
        "dept-test-1",
        event_time,
        "record_read",
        "synthetic-core-system",
        "device-test-1",
        "synthetic-office",
        "12",
        "evaluation",
        label,
    )


def calibration_row(event_id: str, event_time: str, label: str) -> tuple[str, ...]:
    return (*evaluation_row(event_id, event_time, label)[:10], "calibration", label)


def test_accepts_valid_baseline_and_employee_day_evaluation_rows() -> None:
    result = validate_events_csv(
        make_csv(
            baseline_row("evt-test-1", "2026-01-01T09:00:00Z"),
            evaluation_row("evt-test-2", "2026-01-02T10:00:00Z", "benign_scenario"),
            evaluation_row("evt-test-3", "2026-01-02T10:30:00Z", "benign_scenario"),
        )
    )

    assert result.valid is True
    assert result.schema_version == "fisheye.events.v1"
    assert result.row_count == 3
    assert result.employee_day_count == 2
    assert result.errors == ()


def test_accepts_calibration_between_baseline_and_held_out_evaluation() -> None:
    result = validate_events_csv(
        make_csv(
            baseline_row("evt-base", "2026-01-01T09:00:00Z"),
            calibration_row("evt-cal", "2026-01-02T09:00:00Z", "threat_scenario"),
            evaluation_row("evt-eval", "2026-01-03T09:00:00Z", "benign_scenario"),
        )
    )

    assert result.valid is True
    assert result.schema_version == "fisheye.events.v2"
    assert result.employee_day_count == 3


def test_rejects_calibration_after_held_out_evaluation() -> None:
    result = validate_events_csv(
        make_csv(
            baseline_row("evt-base", "2026-01-01T09:00:00Z"),
            evaluation_row("evt-eval", "2026-01-02T09:00:00Z", "benign_scenario"),
            calibration_row("evt-cal", "2026-01-03T09:00:00Z", "threat_scenario"),
        )
    )

    assert result.valid is False
    assert any("calibration events must predate evaluation" in error for error in result.errors)


def test_rejects_timestamp_without_time_component() -> None:
    result = validate_events_csv(
        make_csv(
            baseline_row("evt-test-1", "2026-01-01Z"),
            evaluation_row("evt-test-2", "2026-01-02T00:00:00Z", "benign_scenario"),
        )
    )

    assert result.valid is False
    assert any("valid UTC timestamp" in error for error in result.errors)


def test_rejects_employee_day_split_across_partitions() -> None:
    result = validate_events_csv(
        make_csv(
            baseline_row("evt-test-1", "2026-01-02T09:00:00Z"),
            evaluation_row("evt-test-2", "2026-01-02T10:00:00Z", "benign_scenario"),
        )
    )

    assert result.valid is False
    assert any("cannot be split" in error for error in result.errors)


def test_rejects_conflicting_truth_labels_within_employee_day() -> None:
    result = validate_events_csv(
        make_csv(
            evaluation_row("evt-test-1", "2026-01-02T10:00:00Z", "benign_scenario"),
            evaluation_row("evt-test-2", "2026-01-02T10:30:00Z", "threat_scenario"),
        )
    )

    assert result.valid is False
    assert any("one consistent ground_truth_label" in error for error in result.errors)


def test_caps_validation_errors_and_reports_omitted_count() -> None:
    malformed = list(evaluation_row("evt-test-1", "2026-01-02T10:00:00Z", "threat_scenario"))
    malformed[5] = "unknown_event"
    malformed[9] = "-1"
    rows = [tuple([f"evt-{index}", *malformed[1:]]) for index in range(250)]

    result = validate_events_csv(make_csv(*rows))

    assert result.valid is False
    assert len(result.errors) == 100
    assert "additional validation errors omitted." in result.errors[-1]


def test_rejects_baseline_after_evaluation_and_malformed_values() -> None:
    malformed = list(evaluation_row("evt-test-1", "2026-01-02T10:00:00Z", "threat_scenario"))
    malformed[5] = "unknown_event"
    malformed[9] = "-4"
    result = validate_events_csv(
        make_csv(
            baseline_row("evt-test-2", "2026-01-03T10:00:00Z"),
            tuple(malformed),
        )
    )

    assert result.valid is False
    assert any("must predate" in error for error in result.errors)
    assert any("event_type" in error for error in result.errors)
    assert any("record_count" in error for error in result.errors)

    offset_timestamp = validate_events_csv(
        make_csv(evaluation_row("evt-test-3", "2026-01-02T10:00:00+00:00", "threat_scenario"))
    )
    assert any("ending in Z" in error for error in offset_timestamp.errors)


def test_record_count_stays_within_signed_64_bit_parquet_range() -> None:
    maximum = list(evaluation_row("evt-test-max", "2026-01-02T10:00:00Z", "benign_scenario"))
    maximum[9] = str(2**63 - 1)
    overflow = list(evaluation_row("evt-test-overflow", "2026-01-02T10:00:00Z", "benign_scenario"))
    overflow[9] = str(2**63)

    accepted = validate_events_csv(make_csv(tuple(maximum)))
    rejected = validate_events_csv(make_csv(tuple(overflow)))

    assert accepted.valid is True
    assert rejected.valid is False
    assert any("signed 64-bit integer" in error for error in rejected.errors)


def test_requires_exact_versioned_headers_and_utf8() -> None:
    duplicate_headers = (*CSV_HEADERS[:-1], CSV_HEADERS[0])
    duplicate = validate_events_csv(make_csv(headers=duplicate_headers))
    invalid_encoding = validate_events_csv(b"\xff")

    assert duplicate.valid is False
    assert any("duplicated" in error for error in duplicate.errors)
    assert invalid_encoding.valid is False
    assert "UTF-8" in invalid_encoding.errors[0]


def test_validation_endpoint_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("FISHEYE_ENABLE_DEV_CSV_VALIDATION", raising=False)
    response = TestClient(app).post(
        "/api/v1/datasets/imports/validate",
        content=make_csv(baseline_row("evt-test-1", "2026-01-01T09:00:00Z")),
        headers={"Content-Type": "text/csv", "X-FishEye-Synthetic-Data-Confirmed": "true"},
    )

    assert response.status_code == 503


def test_validation_endpoint_requires_synthetic_confirmation(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_VALIDATION", "1")
    response = TestClient(app).post(
        "/api/v1/datasets/imports/validate",
        content=make_csv(baseline_row("evt-test-1", "2026-01-01T09:00:00Z")),
        headers={"Content-Type": "text/csv"},
    )

    assert response.status_code == 400


def test_validation_endpoint_returns_schema_check_without_importing(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_VALIDATION", "1")
    response = TestClient(app).post(
        "/api/v1/datasets/imports/validate",
        content=make_csv(
            baseline_row("evt-test-1", "2026-01-01T09:00:00Z"),
            evaluation_row("evt-test-2", "2026-01-02T09:00:00Z", "benign_scenario"),
        ),
        headers={
            "Content-Type": "text/csv",
            "X-FishEye-Synthetic-Data-Confirmed": "true",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "valid": True,
        "schema_version": "fisheye.events.v1",
        "row_count": 2,
        "employee_day_count": 2,
        "errors": [],
        "persisted": False,
        "run_created": False,
    }


def test_validation_endpoint_stays_disabled_outside_development(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "production")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_VALIDATION", "1")
    response = TestClient(app).post(
        "/api/v1/datasets/imports/validate",
        content=make_csv(baseline_row("evt-test-1", "2026-01-01T09:00:00Z")),
        headers={"Content-Type": "text/csv", "X-FishEye-Synthetic-Data-Confirmed": "true"},
    )

    assert response.status_code == 503


def test_validation_endpoint_rejects_oversized_csv(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_VALIDATION", "1")
    monkeypatch.setattr("fisheye_api.main.MAX_CSV_BYTES", 1)
    response = TestClient(app).post(
        "/api/v1/datasets/imports/validate",
        content=b"{}",
        headers={"Content-Type": "text/csv", "X-FishEye-Synthetic-Data-Confirmed": "true"},
    )

    assert response.status_code == 413


def test_validation_endpoint_rejects_unsupported_content_type(monkeypatch) -> None:
    monkeypatch.setenv("FISHEYE_ENV", "development")
    monkeypatch.setenv("FISHEYE_ENABLE_DEV_CSV_VALIDATION", "1")
    response = TestClient(app).post(
        "/api/v1/datasets/imports/validate",
        content=b"{}",
        headers={
            "Content-Type": "application/json",
            "X-FishEye-Synthetic-Data-Confirmed": "true",
        },
    )

    assert response.status_code == 415
