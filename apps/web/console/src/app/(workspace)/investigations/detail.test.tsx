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

function detail(
  reviews: unknown[] = [],
  review_status: 'unreviewed' | 'reviewed_benign' = 'unreviewed',
) {
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
      review_status,
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
  it('loads findings when route separators arrive percent-encoded', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    vi.resetModules();
    const { InvestigationDetail } = await import('./detail');
    const fetchMock = vi.fn((input: Request | string) => {
      const url = input instanceof Request ? input.url : input;
      expect(url).toContain('/runs/run-1/findings/');
      return response(200, detail());
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <InvestigationDetail findingId="run-1%3Acontextual%3Aemp-synthetic%3A2026-01-02" />,
    );

    expect(await screen.findByText('evt-1')).toBeTruthy();
    expect(
      (screen.getByLabelText('Investigation status') as HTMLSelectElement)
        .value,
    ).toBe('');
    expect(
      (
        screen.getByRole('button', {
          name: 'Save review update',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Investigation status'), {
      target: { value: 'under_review' },
    });
    expect(
      (
        screen.getByRole('button', {
          name: 'Save review update',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('loads stored evidence and appends a review without changing finding data', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
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
      return response(
        200,
        detail(
          postRequestCount ? reviews : [],
          postRequestCount ? 'reviewed_benign' : 'unreviewed',
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <InvestigationDetail findingId="run-1:contextual:emp-synthetic:2026-01-02" />,
    );

    expect(await screen.findByText('evt-1')).toBeTruthy();
    expect(
      screen.getByText(/Ground-truth labels are hidden here/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Investigation status'), {
      target: { value: 'reviewed_benign' },
    });
    fireEvent.change(screen.getByLabelText(/What did you check or learn/), {
      target: { value: 'Synthetic test review.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save review update' }));

    expect(
      await screen.findByText('Saved as Resolved — activity expected.'),
    ).toBeTruthy();
    expect(
      await screen.findByRole('link', { name: 'View review history (1)' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Investigation status')).toBeTruthy();
    expect(screen.getByText('evt-1')).toBeTruthy();
  });
});
