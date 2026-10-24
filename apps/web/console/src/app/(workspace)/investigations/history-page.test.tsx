import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvestigationHistoryPage } from './history-page';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('investigation updates page empty states', () => {
  it('distinguishes filtered empty results from an empty review history', async () => {
    vi.stubEnv('FISHEYE_TEST_API_URL', 'http://127.0.0.1:8000');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [],
              limit: 50,
              offset: 0,
              total: 0,
              has_more: false,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );

    render(<InvestigationHistoryPage />);
    const search = screen.getByRole('searchbox', {
      name: 'Employee, reviewer or note',
    });

    expect(
      await screen.findByText('No investigation updates yet'),
    ).toBeTruthy();
    expect(search.getAttribute('maxlength')).toBe('160');

    fireEvent.change(search, { target: { value: 'someone' } });

    expect(await screen.findByText('No matching updates')).toBeTruthy();
    expect(screen.queryByText('No investigation updates yet')).toBeNull();
  });
});
