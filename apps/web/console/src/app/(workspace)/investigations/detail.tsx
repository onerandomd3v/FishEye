'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { components } from '@fisheye/api-client';
import { Button, Notice } from '@fisheye/ui';
import { EmptyState } from '../shared';
import { apiBaseUrl, apiErrorMessage, investigationApi } from './data';

type FindingDetail = components['schemas']['FindingDetailResponse'];
type ReviewDecision =
  components['schemas']['FindingReviewCreateRequest']['decision'];

const reasonDescriptions: Record<string, string> = {
  out_of_role_access: 'Access to a system outside the employee role context',
  high_access_volume: 'Access volume above the role baseline',
  repeated_failed_sign_ins:
    'Repeated failed sign-ins in the employee-day window',
  unfamiliar_device: 'Device not observed in the employee baseline history',
  unfamiliar_location: 'Location not observed in the employee baseline history',
  outside_declared_work_schedule: 'Activity outside the declared work schedule',
};

export function InvestigationDetail({ findingId }: { findingId: string }) {
  const [detail, setDetail] = useState<FindingDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(apiBaseUrl()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(
    apiBaseUrl() ? '' : 'The FishEye API is not configured.',
  );
  const [decision, setDecision] = useState<ReviewDecision>('under_review');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const runId = findingId.split(':', 1)[0] ?? '';

  const loadDetail = useCallback(async () => {
    if (!apiBaseUrl()) {
      return;
    }
    try {
      const {
        data,
        error: apiError,
        response,
      } = await investigationApi().GET(
        '/api/v1/runs/{run_id}/findings/{finding_id}',
        { params: { path: { run_id: runId, finding_id: findingId } } },
      );
      if (!response.ok || !data)
        throw new Error(
          typeof apiError?.detail === 'string'
            ? apiError.detail
            : `Finding evidence could not be loaded (${response.status}).`,
        );
      setDetail(data);
    } catch (cause) {
      setDetail(null);
      setError(apiErrorMessage(cause, 'Finding evidence could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [findingId, runId]);

  useEffect(() => {
    void Promise.resolve().then(loadDetail);
  }, [loadDetail]);

  function retryDetail() {
    setLoading(true);
    setError('');
    void loadDetail();
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const {
        data,
        error: apiError,
        response,
      } = await investigationApi().POST(
        '/api/v1/runs/{run_id}/findings/{finding_id}/reviews',
        {
          params: { path: { run_id: runId, finding_id: findingId } },
          body: { decision, note: note.trim() || null },
        },
      );
      if (!response.ok || !data)
        throw new Error(
          typeof apiError?.detail === 'string'
            ? apiError.detail
            : `Review could not be saved (${response.status}).`,
        );
      setMessage(`Review recorded as ${data.decision}.`);
      setNote('');
      await loadDetail();
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Review could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <p className="card section-card" role="status">
        Loading finding evidence…
      </p>
    );
  if (error && !detail) {
    return (
      <div role="alert">
        <Notice title="Finding could not be loaded">
          <p>{error}</p>
          <Button variant="secondary" onClick={retryDetail}>
            Retry
          </Button>
        </Notice>
      </div>
    );
  }
  if (!detail) {
    return (
      <EmptyState title="Finding unavailable">
        This finding may not exist in the selected completed run.
      </EmptyState>
    );
  }

  const finding = detail.finding;
  return (
    <>
      <div className="detail-meta">
        <span className="fixture-tag">
          Synthetic · run {finding.run_id.slice(0, 8)}
        </span>
        <span className="fixture-tag">
          {finding.detector.replaceAll('_', ' ')}
        </span>
        <span className="fixture-tag">
          {finding.severity} priority · {finding.score} / 100
        </span>
        <span className="fixture-tag">
          Employee day: {finding.employee_day_utc} UTC
        </span>
      </div>
      <Notice title="Local development review mode">
        Review records are stored for this synthetic run, but no analyst is
        authenticated. This is not suitable for shared or production use.
      </Notice>
      <div className="two-column">
        <section className="card card-pad" aria-labelledby="signals-title">
          <h2 id="signals-title">Detector reasons</h2>
          <p className="card-intro">
            These reason codes and scores are stored outputs from the selected
            completed run.
          </p>
          {finding.reason_codes.length > 0 ? (
            <ul className="evidence-list">
              {finding.reason_codes.map((reason) => (
                <li className="evidence-row" key={reason}>
                  <span className="evidence-number" aria-hidden="true">
                    •
                  </span>
                  <div>
                    <h3>
                      {reasonDescriptions[reason] ??
                        reason.replaceAll('_', ' ')}
                    </h3>
                    <p>Reason code: {reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No reason codes were stored for this finding.</p>
          )}
          <h3 className="subheading">Source events</h3>
          {detail.events.length === 0 ? (
            <p>No source event references are available for this finding.</p>
          ) : (
            <div className="table-wrap" id="event-table">
              <table className="data-table">
                <caption className="visually-hidden">
                  Synthetic source events supporting finding{' '}
                  {finding.finding_id}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Event ID</th>
                    <th scope="col">UTC timestamp</th>
                    <th scope="col">Event</th>
                    <th scope="col">Role context</th>
                    <th scope="col">System</th>
                    <th scope="col">Device / location</th>
                    <th scope="col">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.events.map((event) => (
                    <tr key={event.event_id}>
                      <td>{event.event_id}</td>
                      <td>{event.event_timestamp_utc}</td>
                      <td>{event.event_type}</td>
                      <td>
                        {event.role_id} · {event.department_id}
                      </td>
                      <td>{event.system}</td>
                      <td>
                        {[event.device_id, event.location_label]
                          .filter(Boolean)
                          .join(' · ') || 'Not provided'}
                      </td>
                      <td>{event.record_count ?? 'Not provided'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="below-table-note">
            Evidence comes from the imported synthetic CSV. Ground-truth labels
            are excluded from this view and are never detector evidence.
          </p>
        </section>

        <aside className="card context-card" aria-label="Human review">
          <h2>Human review</h2>
          <p className="card-intro">
            A review adds an assessment to the history. It does not change the
            run, score or source events.
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="form-success">
              {message}
            </p>
          )}
          <form className="review-form" onSubmit={submitReview}>
            <div className="field">
              <label htmlFor="review-decision">Review decision</label>
              <select
                id="review-decision"
                value={decision}
                disabled={saving}
                onChange={(event) =>
                  setDecision(event.target.value as ReviewDecision)
                }
              >
                <option value="under_review">Under review</option>
                <option value="reviewed_benign">Reviewed as benign</option>
                <option value="escalated">Escalated for investigation</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="review-note">Note (optional)</label>
              <textarea
                id="review-note"
                maxLength={1000}
                value={note}
                disabled={saving}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Record a concise evidence-based note"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving review…' : 'Record review'}
            </Button>
          </form>

          <h3 className="subheading">Review history</h3>
          {detail.reviews.length === 0 ? (
            <p>No reviews have been recorded for this finding.</p>
          ) : (
            <ol className="review-history">
              {detail.reviews.map((review) => (
                <li key={review.review_id}>
                  <strong>{review.decision.replaceAll('_', ' ')}</strong>
                  <span>{review.created_at}</span>
                  <span>{review.reviewer_label}</span>
                  {review.note && <p>{review.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
      <div className="table-actions">
        <Link className="fe-button fe-button-secondary" href="/investigations">
          Back to findings
        </Link>
      </div>
    </>
  );
}
