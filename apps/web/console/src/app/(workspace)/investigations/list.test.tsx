import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  it('renders findings returned by a completed API run', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://127.0.0.1:8000');
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
    expect(screen.getByText('new_device')).toBeTruthy();
    expect(screen.getByText(/Run run-real/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('explains the API configuration error and offers a retry', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.resetModules();
    const { InvestigationList } = await import('./list');
    render(<InvestigationList />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/NEXT_PUBLIC_API_BASE_URL/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
