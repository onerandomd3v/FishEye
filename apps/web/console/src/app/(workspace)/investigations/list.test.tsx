import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('investigation list', () => {
  it('shows saved review status and filters the review queue', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    vi.resetModules();
    const { InvestigationList } = await import('./list');
    const fetchMock = vi.fn((input: Request | string) => {
      const url = input instanceof Request ? input.url : input;
      if (url.includes('/api/v1/runs?'))
        return response(200, {
          items: [
            {
              run_id: 'run-real',
              dataset_id: 'dataset-real',
              status: 'completed',
              methodology_version: 'method-v1',
              claim_status: 'provisional_experiment; not_benchmarked',
              created_at: '2026-01-02T00:00:00Z',
              synthetic_only: true,
              metrics: null,
            },
          ],
          limit: 50,
          offset: 0,
          total: 1,
          has_more: false,
        });
      return response(200, {
        items: [
          {
            finding_id: 'run-real:contextual:emp-synth-1:2026-01-02',
            run_id: 'run-real',
            employee_id: 'emp-synth-1',
            employee_day_utc: '2026-01-02',
            detector: 'contextual',
            score: 60,
            severity: 'Medium',
            reason_codes: ['new_device'],
            evidence_event_ids: ['event-synth-1'],
            review_status: 'unreviewed',
          },
          {
            finding_id: 'run-real:contextual:emp-synth-2:2026-01-03',
            run_id: 'run-real',
            employee_id: 'emp-synth-2',
            employee_day_utc: '2026-01-03',
            detector: 'contextual',
            score: 55,
            severity: 'Medium',
            reason_codes: ['high_access_volume'],
            evidence_event_ids: ['event-synth-2'],
            review_status: 'under_review',
          },
        ],
        detector: 'contextual',
        limit: 50,
        offset: 0,
        total: 1,
        has_more: false,
        claim_status: 'provisional_experiment; not_benchmarked',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<InvestigationList />);

    expect(
      await screen.findByRole('link', { name: 'emp-synth-1' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('option', {
        name: /\b(?:UTC|GMT(?:[+-]\d+)?) · run-real · completed$/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText('New device')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Review queue' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Needs review' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Under review' })).toBeTruthy();
    const findingLink = screen.getByRole('link', { name: 'emp-synth-1' });
    expect(findingLink.getAttribute('href')).toContain('run_id=run-real');
    expect(findingLink.getAttribute('href')).toContain('detector=contextual');
    fireEvent.change(screen.getByLabelText('Review status'), {
      target: { value: 'under_review' },
    });
    expect(screen.queryByRole('link', { name: 'emp-synth-1' })).toBeNull();
    expect(screen.getByRole('link', { name: 'emp-synth-2' })).toBeTruthy();
    expect(screen.getByText(/Run run-real/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('explains the API configuration error and offers a retry', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', '');
    vi.resetModules();
    const { InvestigationList } = await import('./list');
    render(<InvestigationList />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/FishEye API is not configured/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
