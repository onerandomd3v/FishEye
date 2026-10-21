import logging

import pytest
from fisheye_worker.main import main


def test_scaffold_startup_is_explicit_and_exits(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO):
        main()

    assert "no evaluation jobs configured" in caplog.text
