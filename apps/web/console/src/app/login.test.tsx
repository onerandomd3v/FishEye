import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './login/page';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.history.replaceState({}, '', '/login');
});

describe('demo sign-in page', () => {
  it('renders the configured demo credential form in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<LoginPage />);

    expect(screen.getByLabelText('Work email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(
      screen.getByText(/No external identity provider is required/),
    ).toBeTruthy();
  });
});
