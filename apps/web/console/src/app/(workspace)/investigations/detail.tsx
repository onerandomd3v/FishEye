'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
type ReviewStatus = FindingDetail['finding']['review_status'];
type ReviewDecision = Exclude<ReviewStatus, 'unreviewed'>;

const reasonDescriptions: Record<string, string> = {
  out_of_role_access: 'Access to a system outside the employee role context',
  high_access_volume: 'Access volume above the role baseline',
  repeated_failed_sign_ins:
    'Repeated failed sign-ins in the employee-day window',
  unfamiliar_device: 'Device not observed in the employee baseline history',
  unfamiliar_location: 'Location not observed in the employee baseline history',
  outside_declared_work_schedule: 'Activity outside the declared work schedule',
};

export function InvestigationDetail({
  findingId,
  queueHref = '/investigations',
  historyHref,
}: {
  findingId: string;
  queueHref?: string;
  historyHref?: string;
}) {
  const normalizedFindingId = normalizeFindingRouteId(findingId);
  const [detail, setDetail] = useState<FindingDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(apiBaseUrl()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(
    apiBaseUrl() ? '' : 'The FishEye API is not configured.',
  );
  const [decision, setDecision] = useState<ReviewDecision | ''>('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const runId = normalizedFindingId.split(':', 1)[0] ?? '';

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
        {
          params: {
            path: { run_id: runId, finding_id: normalizedFindingId },
          },
        },
      );
      if (!response.ok || !data)
        throw new Error(
          typeof apiError?.detail === 'string'
            ? apiError.detail
            : `Finding evidence could not be loaded (${response.status}).`,
        );
      setDetail(data);
      setDecision(
        data.finding.review_status === 'unreviewed'
          ? ''
          : data.finding.review_status,
      );
    } catch (cause) {
      setDetail(null);
      setError(apiErrorMessage(cause, 'Finding evidence could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [normalizedFindingId, runId]);

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
    if (!decision) {
      setError('Choose an investigation status before saving.');
      return;
    }
    if (!note.trim()) {
      setError('Add a short note about what you checked or learned.');
      return;
    }
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
          params: {
            path: { run_id: runId, finding_id: normalizedFindingId },
          },
          body: { decision, note: note.trim() || null },
        },
      );
      if (!response.ok || !data)
        throw new Error(
          typeof apiError?.detail === 'string'
            ? apiError.detail
            : `Review could not be saved (${response.status}).`,
        );
      setMessage(`Saved as ${reviewStatusLabel(data.decision)}.`);
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
        <span className="fixture-tag">Run {finding.run_id.slice(0, 8)}</span>
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
      <Notice title="Synthetic demo review mode">
        This demo uses one configured analyst login. Review records are saved to
        the synthetic run and do not change its evidence or scores.
      </Notice>
      <div className="investigation-layout">
        <section
          className="card investigation-card"
          aria-labelledby="signals-title"
        >
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
            <div className="source-event-list" aria-label="Source events">
              {detail.events.map((event) => (
                <article className="source-event" key={event.event_id}>
                  <h4 className="visually-hidden">Event {event.event_id}</h4>
                  <dl className="source-event-grid">
                    <div>
                      <dt>Event ID</dt>
                      <dd>{event.event_id}</dd>
                    </div>
                    <div>
                      <dt>Time (UTC)</dt>
                      <dd>{event.event_timestamp_utc}</dd>
                    </div>
                    <div>
                      <dt>Event</dt>
                      <dd>{event.event_type}</dd>
                    </div>
                    <div>
                      <dt>Role and team</dt>
                      <dd>
                        {event.role_id} · {event.department_id}
                      </dd>
                    </div>
                    <div>
                      <dt>System</dt>
                      <dd>{event.system}</dd>
                    </div>
                    <div>
                      <dt>Device and location</dt>
                      <dd>
                        {[event.device_id, event.location_label]
                          .filter(Boolean)
                          .join(' · ') || 'Not provided'}
                      </dd>
                    </div>
                    <div>
                      <dt>Records</dt>
                      <dd>{event.record_count ?? 'Not provided'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
          <p className="below-table-note">
            Ground-truth labels are hidden here and are never detector evidence.
          </p>
        </section>

        <aside className="card investigation-card" aria-label="Human review">
          <h2>Human review</h2>
          <p className="card-intro">
            Record progress and what you learned. Review status does not change
            employee access.
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
              <label htmlFor="review-decision">Investigation status</label>
              <select
                id="review-decision"
                value={decision}
                disabled={saving}
                onChange={(event) =>
                  setDecision(event.target.value as ReviewDecision)
                }
              >
                <option value="" disabled>
                  Choose a status
                </option>
                <option value="under_review">Under review</option>
                <option value="reviewed_benign">
                  Resolved — activity expected
                </option>
                <option value="escalated">Escalated — needs follow-up</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="review-note">What did you check or learn?</label>
              <textarea
                id="review-note"
                maxLength={1000}
                required
                value={note}
                disabled={saving}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Record what you checked, asked, or learned"
              />
            </div>
            <Button
              type="submit"
              disabled={saving || !decision || !note.trim()}
            >
              {saving ? 'Saving…' : 'Save review update'}
            </Button>
          </form>

          <Link
            className="review-history-link"
            href={
              historyHref ??
              `/investigations/${encodeURIComponent(findingId)}/history`
            }
          >
            View review history ({detail.reviews.length})
          </Link>
        </aside>
      </div>
      <div className="table-actions">
        <Link className="fe-button fe-button-secondary" href={queueHref}>
          Back to queue
        </Link>
      </div>
    </>
  );
}
