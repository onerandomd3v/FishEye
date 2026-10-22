// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDemoSession,
  demoLoginConfigured,
  verifyDemoSession,
} from './demo-auth';

afterEach(() => vi.unstubAllEnvs());

describe('environment-configured demo session', () => {
  it('issues an API-verifiable analyst session when configured', async () => {
    vi.stubEnv(
      'FISHEYE_SESSION_SECRET',
      'test-secret-with-at-least-32-bytes-long',
    );
    vi.stubEnv('FISHEYE_DEMO_EMAIL', 'analyst@example.test');
    vi.stubEnv('FISHEYE_DEMO_PASSWORD', 'a-long-demo-password');

    expect(demoLoginConfigured()).toBe(true);
    const session = await createDemoSession('analyst@example.test');
    expect(await verifyDemoSession(session ?? undefined)).toBe(true);
  });

  it('rejects missing and modified sessions', async () => {
    vi.stubEnv(
      'FISHEYE_SESSION_SECRET',
      'test-secret-with-at-least-32-bytes-long',
    );

    expect(await verifyDemoSession(undefined)).toBe(false);
    const session = await createDemoSession('analyst@example.test');
    expect(session).toBeTruthy();
    expect(await verifyDemoSession(`${session}x`)).toBe(false);
  });

  it('requires a long password and a strong signing secret', () => {
    vi.stubEnv('FISHEYE_DEMO_EMAIL', 'analyst@example.test');
    vi.stubEnv('FISHEYE_DEMO_PASSWORD', 'short');
    vi.stubEnv('FISHEYE_SESSION_SECRET', 'too-short');

    expect(demoLoginConfigured()).toBe(false);
  });
});
