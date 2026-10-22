import logging

import pytest
from fisheye_worker.main import main


def test_scaffold_startup_is_explicit_and_exits(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO):
        main([])

    assert "no evaluation jobs configured" in caplog.text


def test_dataset_preparation_logs_no_dataset_values(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    from fisheye_worker import dataset_preparation
    from fisheye_worker.dataset_preparation import PreparationResult

    monkeypatch.setattr(
        dataset_preparation,
        "prepare_dataset_from_environment",
        lambda dataset_id: PreparationResult(
            dataset_id=dataset_id,
            preparation_status="prepared",
            analysis_manifest_sha256="a" * 64,
            row_count=17,
            employee_day_count=5,
        ),
    )

    with caplog.at_level(logging.INFO):
        main(["prepare-dataset", "--dataset-id", "synthetic-dataset-private"])

    assert "completed" in caplog.text
    assert "synthetic-dataset-private" not in caplog.text
    assert "17" not in caplog.text
    assert "5" not in caplog.text
