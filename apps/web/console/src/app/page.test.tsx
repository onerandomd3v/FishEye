import { describe, expect, it, vi } from 'vitest';
import HomePage from './page';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}));

describe('console entry route', () => {
  it('sends visitors to the sign-in preview', () => {
    HomePage();
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
