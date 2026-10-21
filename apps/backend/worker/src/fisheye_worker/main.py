"""Worker entrypoint for local dataset preparation; evaluation jobs are not implemented."""

import argparse
import logging
from collections.abc import Sequence


def main(argv: Sequence[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(prog="fisheye-worker")
    commands = parser.add_subparsers(dest="command")
    prepare = commands.add_parser(
        "prepare-dataset",
        help="convert an imported synthetic CSV to encrypted, label-isolated Parquet artifacts",
    )
    prepare.add_argument("--dataset-id", required=True)
    args = parser.parse_args(argv)

    if args.command == "prepare-dataset":
        from fisheye_worker.dataset_preparation import prepare_dataset_from_environment

        result = prepare_dataset_from_environment(args.dataset_id)
        logging.info(
            "Prepared synthetic dataset: %d events across %d employee-days. "
            "No run was created and no risk was calculated.",
            result.row_count,
            result.employee_day_count,
        )
        return

    logging.info("FishEye worker ready; no evaluation jobs configured.")


if __name__ == "__main__":
    main()
