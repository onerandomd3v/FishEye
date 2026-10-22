// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const { cookieSet } = vi.hoisted(() => ({ cookieSet: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet }),
}));

import { POST } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function loginRequest(password = 'correct-password') {
  return new Request('https://console.example.test/api/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://console.example.test',
      'x-forwarded-for': '198.51.100.99',
      'x-vercel-forwarded-for': '192.0.2.20',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email: 'analyst@example.test', password }),
  });
}

function configureEnvironment() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('FISHEYE_CONSOLE_URL', 'https://console.example.test');
  vi.stubEnv('API_INTERNAL_URL', 'https://api.example.test');
  vi.stubEnv(
    'FISHEYE_SESSION_SECRET',
    'test-secret-with-at-least-32-bytes-long',
  );
  vi.stubEnv('FISHEYE_DEMO_EMAIL', 'analyst@example.test');
  vi.stubEnv('FISHEYE_DEMO_PASSWORD', 'correct-password');
}

describe('console demo-login proxy', () => {
  it('checks the API throttle then stores a console-issued session securely', async () => {
    configureEnvironment();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ allowed: true }))
      .mockResolvedValueOnce(Response.json({ allowed: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(
      'https://api.example.test/api/v1/auth/login-throttle',
    );
    const forwarded = JSON.parse(String(init.body));
    expect(forwarded.action).toBe('check');
    expect(forwarded.email).toBe('analyst@example.test');
    expect(forwarded.password).toBeUndefined();
    expect(forwarded.client_ip).toBe('192.0.2.20');
    expect(forwarded.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).action).toBe(
      'success',
    );
    expect(cookieSet).toHaveBeenCalledWith(
      'fisheye_demo_session',
      expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      }),
    );
  });

  it('preserves API throttling status and Retry-After', async () => {
    configureEnvironment();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { detail: 'Too many sign-in attempts. Try again later.' },
            { status: 429, headers: { 'retry-after': '300' } },
          ),
        ),
    );

    const response = await POST(loginRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('300');
    expect((await response.json()).error).toContain(
      'Too many sign-in attempts',
    );
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('records a failed attempt without forwarding the password to the API', async () => {
    configureEnvironment();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ allowed: true }))
      .mockResolvedValueOnce(Response.json({ allowed: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(loginRequest('wrong-password'));

    expect(response.status).toBe(401);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).action).toBe(
      'failure',
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).password,
    ).toBeUndefined();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('fails closed when the deployment has no trusted client IP source', async () => {
    configureEnvironment();
    vi.stubEnv('VERCEL', '0');
    vi.stubGlobal('fetch', vi.fn());

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('Trusted client IP');
    expect(fetch).not.toHaveBeenCalled();
  });
});
