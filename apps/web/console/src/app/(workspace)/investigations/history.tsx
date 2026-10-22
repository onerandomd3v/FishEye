'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { components } from '@fisheye/api-client';
import { Button, Notice } from '@fisheye/ui';
import { EmptyState } from '../shared';
import {
  apiBaseUrl,
  apiErrorMessage,
  investigationApi,
  normalizeFindingRouteId,
  reviewStatusLabel,
} from './data';

type FindingDetail = components['schemas']['FindingDetailResponse'];

function formatRecordedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)} (local time)`;
}

export function InvestigationHistory({
  findingId,
  findingHref,
  queueHref,
}: {
  findingId: string;
  findingHref: string;
  queueHref: string;
}) {
  const normalizedFindingId = normalizeFindingRouteId(findingId);
  const runId = normalizedFindingId.split(':', 1)[0] ?? '';
  const [detail, setDetail] = useState<FindingDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(apiBaseUrl()));
  const [error, setError] = useState(
    apiBaseUrl() ? '' : 'The FishEye API is not configured.',
  );

  const loadHistory = useCallback(async () => {
    if (!apiBaseUrl()) return;
    try {
      const {
        data,
        error: apiError,
        response,
      } = await investigationApi().GET(
        '/api/v1/runs/{run_id}/findings/{finding_id}',
        {
          params: {
            path: { run_id: runId, finding_id: normalizedFindingId },
          },
        },
      );
      if (!response.ok || !data) {
        throw new Error(
          typeof apiError?.detail === 'string'
            ? apiError.detail
            : `Review history could not be loaded (${response.status}).`,
        );
      }
      setDetail(data);
      setError('');
    } catch (cause) {
      setDetail(null);
      setError(apiErrorMessage(cause, 'Review history could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [normalizedFindingId, runId]);

  useEffect(() => {
    void Promise.resolve().then(loadHistory);
  }, [loadHistory]);

  function retry() {
    setLoading(true);
    void loadHistory();
  }

  if (loading) {
    return <p role="status">Loading review history…</p>;
  }
  if (error) {
    return (
      <div role="alert">
        <Notice title="Review history could not be loaded">
          <p>{error}</p>
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        </Notice>
      </div>
    );
  }
  if (!detail) {
    return (
      <EmptyState title="History unavailable">
        The selected finding could not be found.
      </EmptyState>
    );
  }

  const finding = detail.finding;
  return (
    <>
      <div className="detail-meta">
        <span className="fixture-tag">{finding.employee_id}</span>
        <span className="fixture-tag">Run {finding.run_id.slice(0, 8)}</span>
        <span className="fixture-tag">{finding.employee_day_utc} UTC</span>
        <span className="fixture-tag">
          Current status: {reviewStatusLabel(finding.review_status)}
        </span>
      </div>

      <section
        className="card review-history-page"
        aria-labelledby="history-title"
      >
        <h2 id="history-title">Review history</h2>
        <p className="card-intro">
          Every saved status update and analyst note for this finding.
        </p>
        {detail.reviews.length === 0 ? (
          <p className="review-history-empty">
            No updates have been recorded. The finding is still marked Needs
            review.
          </p>
        ) : (
          <ol className="review-history review-history-full">
            {detail.reviews.map((review) => (
              <li key={review.review_id}>
                <strong>{reviewStatusLabel(review.decision)}</strong>
                <time dateTime={review.created_at}>
                  {formatRecordedAt(review.created_at)}
                </time>
                <span>Recorded by {review.reviewer_label}</span>
                <p>{review.note?.trim() || 'No note was added.'}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="table-actions review-history-actions">
        <Link className="fe-button fe-button-secondary" href={queueHref}>
          Back to queue
        </Link>
        <Link className="fe-button fe-button-primary" href={findingHref}>
          Back to finding
        </Link>
      </div>
    </>
  );
}
