import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

pytestmark = pytest.mark.integration


def test_initial_migration_and_rollback() -> None:
    database_url = os.environ.get("FISHEYE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set FISHEYE_TEST_DATABASE_URL to a disposable PostgreSQL database")
    parsed_url = urlsplit(database_url)
    if parsed_url.hostname not in {"localhost", "127.0.0.1", "postgres"}:
        pytest.fail("Migration tests may only use a local or CI PostgreSQL service")
    if parsed_url.path.lstrip("/") != "fisheye_test":
        pytest.fail("Migration tests may only use the isolated fisheye_test database")

    api_dir = Path(__file__).parents[1]
    config = Config(str(api_dir / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)

    engine = create_engine(database_url)
    try:
        command.upgrade(config, "head")
        with engine.connect() as connection:
            assert inspect(connection).has_table("alembic_version")
            assert (
                connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                == "0001_initial"
            )
            assert inspect(connection).get_table_names() == ["alembic_version"]

        command.downgrade(config, "base")
        with engine.connect() as connection:
            assert inspect(connection).get_table_names() == ["alembic_version"]
            assert (
                connection.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar_one() == 0
            )
    finally:
        engine.dispose()
