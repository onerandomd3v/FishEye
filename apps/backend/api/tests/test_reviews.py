from unittest.mock import Mock

from fisheye_persistence.reviews import (
    FindingReviewRecord,
    create_finding_review,
    list_latest_finding_reviews,
)


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


def test_latest_review_is_selected_per_finding() -> None:
    session = Mock()
    first = FindingReviewRecord(finding_id="finding-1", decision="under_review")
    latest = FindingReviewRecord(finding_id="finding-1", decision="escalated")
    other = FindingReviewRecord(finding_id="finding-2", decision="reviewed_benign")
    session.scalars.return_value = [first, latest, other]

    result = list_latest_finding_reviews(
        session,
        run_id="run-1",
        finding_ids=["finding-1", "finding-2"],
    )

    assert result == {"finding-1": latest, "finding-2": other}
    session.scalars.assert_called_once()
