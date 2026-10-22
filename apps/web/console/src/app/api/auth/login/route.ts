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
      { error: 'Demo sign-in is not configured for this deployment.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Enter your demo email and password.' },
      { status: 400 },
    );
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Enter your demo email and password.' },
      { status: 400 },
    );
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json(
      { error: 'Enter your demo email and password.' },
      { status: 400 },
    );
  }

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
    return NextResponse.json(
      { error: 'Email or password is incorrect.' },
      { status: 401 },
    );
  }

  const session = await createDemoSession(expectedEmail);
  if (!session) {
    return NextResponse.json(
      { error: 'Demo sign-in is not configured for this deployment.' },
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
