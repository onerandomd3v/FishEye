import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  consoleOrigin,
  createDemoSession,
  DEMO_SESSION_COOKIE,
  demoLoginConfigured,
  DEMO_SESSION_LIFETIME_SECONDS,
  secureStringEquals,
} from '../../../../lib/demo-auth';

type ThrottleResult = {
  ok: boolean;
  status?: number;
  retryAfter?: string | null;
};

async function requestLoginThrottle(
  apiBase: URL,
  sessionSecret: string,
  action: 'check' | 'failure' | 'success',
  email: string,
  clientIp: string,
): Promise<ThrottleResult> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const normalizedEmail = email.trim().toLowerCase();
  const message = `fisheye-login-throttle:v1|${action}|${clientIp}|${normalizedEmail}|${issuedAt}`;
  // Sign throttle metadata only; the password is never included in this message.
  const signature = createHmac('sha256', sessionSecret)
    .update(message)
    .digest('hex');
  const prefix = apiBase.pathname.replace(/\/$/, '');
  const throttleUrl = new URL(
    `${prefix}/api/v1/auth/login-throttle`,
    apiBase.origin,
  );

  try {
    const response = await fetch(throttleUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        email: normalizedEmail,
        client_ip: clientIp,
        issued_at: issuedAt,
        signature,
      }),
      cache: 'no-store',
      redirect: 'manual',
    });
    if (response.status === 429) {
      return {
        ok: false,
        status: 429,
        retryAfter: response.headers.get('retry-after'),
      };
    }
    if (!response.ok) return { ok: false, status: 503 };
    const result = (await response.json()) as { allowed?: unknown };
    return result.allowed === true ? { ok: true } : { ok: false, status: 503 };
  } catch {
    return { ok: false, status: 503 };
  }
}

function throttleError(result: ThrottleResult) {
  const headers = new Headers();
  if (result.retryAfter) headers.set('retry-after', result.retryAfter);
  return NextResponse.json(
    {
      error:
        result.status === 429
          ? 'Too many sign-in attempts. Try again later.'
          : 'The sign-in service could not be reached. Try again.',
    },
    { status: result.status ?? 503, headers },
  );
}

function trustedClientIp(request: Request): string | null {
  if (process.env.NODE_ENV === 'development') return '127.0.0.1';

  const trustedHeader =
    process.env.VERCEL === '1'
      ? 'x-vercel-forwarded-for'
      : process.env.FISHEYE_TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (!trustedHeader) return null;

  const value = request.headers.get(trustedHeader)?.trim();
  return value && isIP(value) ? value : null;
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  try {
    if (!origin && process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'Cross-origin sign-in blocked.' },
        { status: 403 },
      );
    }
    if (origin && new URL(origin).origin !== consoleOrigin(request)) {
      return NextResponse.json(
        { error: 'Cross-origin sign-in blocked.' },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Sign-in is not configured for this deployment.' },
      { status: 503 },
    );
  }

  if (!demoLoginConfigured()) {
    return NextResponse.json(
      { error: 'Sign-in is not configured for this workspace.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Enter your email and password.' },
      { status: 400 },
    );
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Enter your email and password.' },
      { status: 400 },
    );
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.length > 320 ||
    password.length > 1024
  ) {
    return NextResponse.json(
      { error: 'Enter your email and password.' },
      { status: 400 },
    );
  }

  const apiBaseValue = process.env.API_INTERNAL_URL;
  let apiBase: URL;
  try {
    apiBase = new URL(apiBaseValue ?? '');
    if (
      !['http:', 'https:'].includes(apiBase.protocol) ||
      apiBase.username ||
      apiBase.password
    ) {
      throw new Error();
    }
  } catch {
    return NextResponse.json(
      { error: 'The FishEye API URL is invalid.' },
      { status: 503 },
    );
  }

  const sessionSecret = process.env.FISHEYE_SESSION_SECRET!.trim();
  const clientIp = trustedClientIp(request);
  if (!clientIp) {
    return NextResponse.json(
      { error: 'Trusted client IP forwarding is not configured.' },
      { status: 503 },
    );
  }
  const check = await requestLoginThrottle(
    apiBase,
    sessionSecret,
    'check',
    email,
    clientIp,
  );
  if (!check.ok) return throttleError(check);

  const expectedEmail = process.env.FISHEYE_DEMO_EMAIL!;
  const expectedPassword = process.env.FISHEYE_DEMO_PASSWORD!;
  const [emailMatches, passwordMatches] = await Promise.all([
    secureStringEquals(
      email.trim().toLowerCase(),
      expectedEmail.trim().toLowerCase(),
    ),
    secureStringEquals(password, expectedPassword),
  ]);
  if (!emailMatches || !passwordMatches) {
    const failure = await requestLoginThrottle(
      apiBase,
      sessionSecret,
      'failure',
      email,
      clientIp,
    );
    if (!failure.ok) return throttleError(failure);
    return NextResponse.json(
      { error: 'Email or password is incorrect.' },
      { status: 401 },
    );
  }

  const success = await requestLoginThrottle(
    apiBase,
    sessionSecret,
    'success',
    email,
    clientIp,
  );
  if (!success.ok) return throttleError(success);

  const session = await createDemoSession(expectedEmail);
  if (!session) {
    return NextResponse.json(
      { error: 'Sign-in is not configured for this workspace.' },
      { status: 503 },
    );
  }
  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEMO_SESSION_LIFETIME_SECONDS,
  });
  return NextResponse.json({ ok: true });
}
