import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('investigation review history page', () => {
  it('shows each saved status, readable time, reviewer, and note', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    vi.resetModules();
    const { InvestigationHistory } = await import('./history');
    const payload = {
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
        review_status: 'escalated',
      },
      events: [],
      reviews: [
        {
          review_id: 'review-1',
          decision: 'escalated',
          note: 'Manager confirmed the device is being checked.',
          reviewer_label: 'Local development user (not authenticated)',
          created_at: '2026-10-22T14:44:55.445275+00:00',
        },
      ],
      review_mode: 'local_development_unauthenticated',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => payload,
          text: async () => JSON.stringify(payload),
        }),
      ),
    );

    render(
      <InvestigationHistory
        findingId="run-1:contextual:emp-synthetic:2026-01-02"
        findingHref="/investigations/finding"
        queueHref="/investigations"
      />,
    );

    expect(await screen.findByText('Escalated — needs follow-up')).toBeTruthy();
    expect(
      screen.getByText('Manager confirmed the device is being checked.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Recorded by Local development user (not authenticated)',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/\(local time\)$/)).toBeTruthy();
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-10-22T14:44:55.445275+00:00',
    );
    expect(screen.getByRole('link', { name: 'Back to finding' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to queue' })).toBeTruthy();
  });
});
