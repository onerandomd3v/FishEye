"""Worker entrypoint. Job transport and scoring are not implemented yet."""

import logging


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logging.info("FishEye worker scaffold initialized; no evaluation jobs configured.")


if __name__ == "__main__":
    main()
