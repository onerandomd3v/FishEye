"""Worker entrypoint for dataset preparation and durable evaluation processing."""

import argparse
import logging
import os
import time
from collections.abc import Sequence

from fisheye_persistence.artifacts import artifact_store_from_environment
from fisheye_persistence.datasets import create_session_factory

from fisheye_worker.run_processing import process_next_run


def main(argv: Sequence[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(prog="fisheye-worker")
    commands = parser.add_subparsers(dest="command")
    prepare = commands.add_parser(
        "prepare-dataset",
        help="convert an imported synthetic CSV to encrypted, label-isolated Parquet artifacts",
    )
    prepare.add_argument("--dataset-id", required=True)
    commands.add_parser("run-once", help="claim and process one queued evaluation run")
    work = commands.add_parser("work", help="poll PostgreSQL and process queued evaluation runs")
    work.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args(argv)

    if args.command == "prepare-dataset":
        from fisheye_worker.dataset_preparation import prepare_dataset_from_environment

        prepare_dataset_from_environment(args.dataset_id)
        logging.info(
            "Synthetic dataset preparation completed. "
            "No run was created and no risk was calculated."
        )
        return

    if args.command in {"run-once", "work"}:
        database_url = os.getenv("DATABASE_URL")
        encryption_key = os.getenv("FISHEYE_ARTIFACT_ENCRYPTION_KEY")
        try:
            artifact_store = artifact_store_from_environment()
        except RuntimeError:
            artifact_store = None
        if not database_url or artifact_store is None or not encryption_key:
            parser.error("run processing requires DATABASE_URL and encrypted artifact settings")
        if args.command == "work" and args.poll_seconds <= 0:
            parser.error("--poll-seconds must be greater than zero")
        factory = create_session_factory(database_url)
        worker_id = os.getenv("FISHEYE_WORKER_ID") or f"worker-{os.getpid()}"
        if args.command == "run-once":
            processed = process_next_run(
                factory,
                artifact_root=artifact_store,
                encryption_key=encryption_key.encode("utf-8"),
                worker_id=worker_id,
            )
            logging.info("Evaluation worker checked one queue item; processed=%s", processed)
            return
        logging.info("FishEye evaluation worker polling for synthetic runs.")
        while True:
            processed = process_next_run(
                factory,
                artifact_root=artifact_store,
                encryption_key=encryption_key.encode("utf-8"),
                worker_id=worker_id,
            )
            if not processed:
                time.sleep(args.poll_seconds)

    logging.info(
        "FishEye worker ready; no evaluation jobs configured until `fisheye-worker work` starts."
    )


if __name__ == "__main__":
    main()
