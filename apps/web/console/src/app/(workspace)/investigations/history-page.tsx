'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { components } from '@fisheye/api-client';
import { Button, Notice } from '@fisheye/ui';
import { EmptyState } from '../shared';
import {
  apiBaseUrl,
  apiErrorMessage,
  investigationApi,
  reviewStatusLabel,
} from './data';

type ReviewHistoryItem =
  components['schemas']['FindingReviewHistoryItemResponse'];
type ReviewDecision = ReviewHistoryItem['decision'];
type HistoryState = 'loading' | 'ready' | 'error';
const pageSize = 50;

function findingSummary(findingId: string) {
  const [, detector = '', encodedEmployeeId = '', employeeDay = ''] =
    findingId.split(':', 4);
  let employeeId = encodedEmployeeId;
  try {
    employeeId = decodeURIComponent(encodedEmployeeId);
  } catch {
    // Keep the readable portion of the ID if older data has invalid escaping.
  }
  return { detector, employeeId, employeeDay };
}

function formatRecordedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function InvestigationHistoryPage() {
  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [decision, setDecision] = useState<ReviewDecision | ''>('');
  const [search, setSearch] = useState('');
  const [recordedOn, setRecordedOn] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<HistoryState>(
    apiBaseUrl() ? 'loading' : 'error',
  );
  const [error, setError] = useState(
    apiBaseUrl() ? '' : 'The FishEye API is not configured.',
  );
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    const timeout = window.setTimeout(() => {
      if (!apiBaseUrl()) {
        setState('error');
        setError('The FishEye API is not configured.');
        return;
      }
      setState('loading');
      void (async () => {
        try {
          const {
            data,
            error: apiError,
            response,
          } = await investigationApi().GET('/api/v1/reviews', {
            params: {
              query: {
                limit: pageSize,
                offset,
                decision: decision || undefined,
                search: search.trim() || undefined,
                recorded_on: recordedOn || undefined,
              },
            },
          });
          if (!response.ok || !data) {
            throw new Error(
              typeof apiError?.detail === 'string'
                ? apiError.detail
                : `Review history could not be loaded (${response.status}).`,
            );
          }
          if (!current) return;
          setItems(data.items);
          setTotal(data.total);
          setError('');
          setState('ready');
        } catch (cause) {
          if (!current) return;
          setItems([]);
          setError(
            apiErrorMessage(cause, 'Review history could not be loaded.'),
          );
          setState('error');
        }
      })();
    }, 200);
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [decision, offset, recordedOn, reload, search]);

  function retry() {
    setState('loading');
    setReload((value) => value + 1);
  }

  return (
    <section
      className="card section-card"
      aria-labelledby="review-history-title"
    >
      <div className="section-title-row">
        <div>
          <h2 id="review-history-title">Investigation updates</h2>
          <p className="card-intro">
            Follow every saved status and note across findings.
          </p>
        </div>
      </div>

      <div className="filters review-history-filters">
        <div className="field">
          <label htmlFor="history-status">Status</label>
          <select
            id="history-status"
            value={decision}
            onChange={(event) => {
              setDecision(event.target.value as ReviewDecision | '');
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            <option value="under_review">Under review</option>
            <option value="reviewed_benign">Resolved</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="history-date">Updated day (UTC)</label>
          <input
            id="history-date"
            type="date"
            value={recordedOn}
            onChange={(event) => {
              setRecordedOn(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="field search-field">
          <label htmlFor="history-search">Employee, reviewer or note</label>
          <input
            id="history-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
            placeholder="Search history"
          />
        </div>
      </div>

      {state === 'loading' ? (
        <p className="below-table-note" role="status">
          Loading investigation updates…
        </p>
      ) : state === 'error' ? (
        <div role="alert" className="section-content">
          <Notice title="Review history could not be loaded">
            <p>{error}</p>
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          </Notice>
        </div>
      ) : total === 0 ? (
        <div className="section-content">
          <EmptyState title="No investigation updates yet">
            Updates saved from a finding will appear here.
            <span className="empty-state-action">
              <Link
                className="fe-button fe-button-primary"
                href="/investigations"
              >
                Open investigations
              </Link>
            </span>
          </EmptyState>
        </div>
      ) : (
        <>
          <p className="below-table-note" role="status">
            Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total}{' '}
            updates.
          </p>
          <div className="table-wrap">
            <table className="data-table mobile-readable-table review-history-table">
              <caption className="visually-hidden">
                Investigation review updates
              </caption>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Finding day (UTC)</th>
                  <th scope="col">Detector</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reviewer</th>
                  <th scope="col">Updated (local time)</th>
                  <th scope="col">Note</th>
                  <th scope="col">Finding</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const summary = findingSummary(item.finding_id);
                  const findingHref = `/investigations/${encodeURIComponent(item.finding_id)}?run_id=${encodeURIComponent(item.run_id)}&detector=${encodeURIComponent(summary.detector)}`;
                  return (
                    <tr key={item.review_id}>
                      <td data-label="Employee">
                        {summary.employeeId || 'Unknown'}
                      </td>
                      <td data-label="Finding day (UTC)">
                        {summary.employeeDay || 'Not recorded'}
                      </td>
                      <td data-label="Detector">
                        {summary.detector.replaceAll('_', ' ')}
                      </td>
                      <td data-label="Status">
                        {reviewStatusLabel(item.decision)}
                      </td>
                      <td data-label="Reviewer">{item.reviewer_label}</td>
                      <td data-label="Updated (local time)">
                        {formatRecordedAt(item.created_at)}
                      </td>
                      <td className="review-history-note" data-label="Note">
                        {item.note?.trim() || 'No note added'}
                      </td>
                      <td data-label="Finding">
                        <Link href={findingHref}>View finding</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-actions">
            <button
              type="button"
              className="pagination-text"
              disabled={offset === 0}
              onClick={() =>
                setOffset((value) => Math.max(0, value - pageSize))
              }
            >
              Previous page
            </button>
            <button
              type="button"
              className="pagination-text"
              disabled={offset + pageSize >= total}
              onClick={() => setOffset((value) => value + pageSize)}
            >
              Next page
            </button>
          </div>
        </>
      )}
    </section>
  );
}
