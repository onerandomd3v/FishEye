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

function run(runId: string, status: 'queued' | 'completed') {
  return {
    run_id: runId,
    dataset_id: 'dataset-synthetic',
    status,
    methodology_version: 'method-v1',
    claim_status: 'provisional_experiment; not_benchmarked',
    created_at: '2026-01-02T00:00:00Z',
    synthetic_only: true,
    metrics: null,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('live overview', () => {
  it('continues through run history pages to find the latest completed run', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    vi.resetModules();
    const { LiveOverview } = await import('./live-overview');
    const fetchMock = vi.fn((input: Request | string) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === '/api/v1/runs') {
        const offset = url.searchParams.get('offset');
        if (offset === '0') {
          return response(200, {
            items: Array.from({ length: 50 }, (_, index) =>
              run(`queued-${index}`, 'queued'),
            ),
            limit: 50,
            offset: 0,
            total: 51,
            has_more: true,
          });
        }
        return response(200, {
          items: [run('completed-run', 'completed')],
          limit: 50,
          offset: 50,
          total: 51,
          has_more: false,
        });
      }
      return response(200, {
        items: [],
        detector: 'contextual',
        limit: 5,
        offset: 0,
        total: 0,
        has_more: false,
        claim_status: 'provisional_experiment; not_benchmarked',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<LiveOverview />);

    expect(await screen.findByText(/Run completed-run/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
