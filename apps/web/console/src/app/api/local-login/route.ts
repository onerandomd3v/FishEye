import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createLocalSession,
  LOCAL_SESSION_COOKIE,
  secureStringEquals,
} from '../../../lib/local-auth';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(null, { status: 404 });
  }

  const expectedEmail = process.env.FISHEYE_DEMO_EMAIL;
  const expectedPassword = process.env.FISHEYE_DEMO_PASSWORD;
  if (
    !expectedEmail ||
    !expectedPassword ||
    !process.env.FISHEYE_SESSION_SECRET
  ) {
    return NextResponse.json(
      {
        error:
          'Local demo sign-in is not configured. Check apps/web/console/.env.local.',
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Enter your local demo email and password.' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Enter your local demo email and password.' },
      { status: 400 },
    );
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json(
      { error: 'Enter your local demo email and password.' },
      { status: 400 },
    );
  }

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

  const session = await createLocalSession();
  if (!session) {
    return NextResponse.json(
      {
        error:
          'Local demo sign-in is not configured. Check apps/web/console/.env.local.',
      },
      { status: 503 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCAL_SESSION_COOKIE, session, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });

  return NextResponse.json({ ok: true });
}
