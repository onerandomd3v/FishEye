import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function response(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function detail(reviews: unknown[] = []) {
  return {
    finding: {
      finding_id: 'run-1:contextual:emp-synthetic:2026-01-02',
      run_id: 'run-1',
      employee_id: 'emp-synthetic',
      employee_day_utc: '2026-01-02',
      detector: 'contextual',
      score: 60,
      severity: 'Medium',
      reason_codes: ['new_device'],
      evidence_event_ids: ['evt-1'],
    },
    events: [
      {
        event_id: 'evt-1',
        employee_id: 'emp-synthetic',
        role_id: 'role-teller',
        department_id: 'dept-branch',
        event_timestamp_utc: '2026-01-02T09:00:00Z',
        event_type: 'record_read',
        system: 'core',
        device_id: 'synthetic-device',
        location_label: 'branch-1',
        record_count: 40,
      },
    ],
    reviews,
    review_mode: 'local_development_unauthenticated',
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('investigation detail and review history', () => {
  it('loads stored evidence and appends a review without changing finding data', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
    vi.resetModules();
    const { InvestigationDetail } = await import('./detail');
    const reviews = [
      {
        review_id: 'review-1',
        decision: 'reviewed_benign',
        note: 'Synthetic test review.',
        reviewer_label: 'Local development user (not authenticated)',
        created_at: '2026-01-02T10:00:00Z',
      },
    ];
    let postRequestCount = 0;
    const fetchMock = vi.fn((input: Request | string, init?: RequestInit) => {
      const method = input instanceof Request ? input.method : init?.method;
      if (method === 'POST') {
        postRequestCount += 1;
        return response(201, {
          ...reviews[0],
        });
      }
      return response(200, detail(postRequestCount ? reviews : []));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <InvestigationDetail findingId="run-1:contextual:emp-synthetic:2026-01-02" />,
    );

    expect(await screen.findByText('evt-1')).toBeTruthy();
    expect(screen.getByText(/Ground-truth labels are excluded/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Review decision'), {
      target: { value: 'reviewed_benign' },
    });
    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'Synthetic test review.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record review' }));

    expect(
      await screen.findByText('Review recorded as reviewed_benign.'),
    ).toBeTruthy();
    expect(
      await screen.findByText('Local development user (not authenticated)'),
    ).toBeTruthy();
    expect(screen.getByText('evt-1')).toBeTruthy();
  });
});
