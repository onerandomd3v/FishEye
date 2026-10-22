from unittest.mock import Mock

from fisheye_persistence.reviews import create_finding_review


def test_long_reviewer_labels_keep_a_unique_hash_suffix() -> None:
    session = Mock()
    prefix = "x" * 130

    create_finding_review(
        session,
        run_id="run-id",
        finding_id="finding-id",
        decision="escalated",
        note=None,
        reviewer_label=f"{prefix}first",
    )
    first = session.add.call_args.args[0].reviewer_label
    session.reset_mock()
    create_finding_review(
        session,
        run_id="run-id",
        finding_id="finding-id",
        decision="escalated",
        note=None,
        reviewer_label=f"{prefix}second",
    )
    second = session.add.call_args.args[0].reviewer_label

    assert len(first) == 128
    assert len(second) == 128
    assert first != second
