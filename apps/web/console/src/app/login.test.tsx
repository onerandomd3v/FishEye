import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './login/page';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.history.replaceState({}, '', '/login');
});

describe('OIDC sign-in page', () => {
  it('shows a failure notice after an unsuccessful provider callback', () => {
    vi.stubEnv('NODE_ENV', 'production');
    window.history.replaceState({}, '', '/login?error=oidc');

    render(<LoginPage />);

    expect(screen.getByRole('alert').textContent).toContain(
      'Check your access with your administrator and try again.',
    );
  });
});
