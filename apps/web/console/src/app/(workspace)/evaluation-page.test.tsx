import { cleanup, render, screen } from '@testing-library/react';
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

describe('evaluation run history', () => {
  it('links each run to its dedicated results page', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    vi.resetModules();
    const { default: EvaluationPage } = await import('./evaluation/page');
    const runId = '12345678-1234-1234-1234-123456789012';
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        response(200, {
          items: [
            {
              run_id: runId,
              dataset_id: 'dataset-1',
              status: 'completed',
              methodology_version: 'method-v1',
              claim_status: 'provisional',
              created_at: '2026-01-02T00:00:00Z',
              result_manifest_sha256: 'a'.repeat(64),
              synthetic_only: true,
              metrics: null,
            },
          ],
          limit: 50,
          offset: 0,
          total: 1,
          has_more: false,
        }),
      ),
    );

    render(<EvaluationPage />);

    const link = await screen.findByRole('link', {
      name: 'View run 12345678',
    });
    expect(link.getAttribute('href')).toBe(`/evaluation/${runId}`);
  });
});
