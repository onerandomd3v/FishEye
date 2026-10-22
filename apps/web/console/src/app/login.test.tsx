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

describe('analyst sign-in page', () => {
  it('renders the credential form without redundant environment copy', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<LoginPage />);

    expect(screen.getByLabelText('Work email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByText('Sign in to continue.')).toBeTruthy();
    expect(screen.queryByText(/synthetic|demo/i)).toBeNull();
  });
});
