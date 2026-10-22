import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  consoleOrigin,
  DEMO_SESSION_COOKIE,
  verifyDemoSession,
} from '../../../../lib/demo-auth';
import {
  PayloadTooLargeError,
  readBodyWithinLimit,
} from '../../../../lib/body-limits';

type RouteContext = { params: Promise<{ path: string[] }> };
const forwardedHeaders = [
  'accept',
  'content-type',
  'idempotency-key',
  'x-fisheye-synthetic-data-confirmed',
];

async function proxy(request: Request, context: RouteContext) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    origin &&
    new URL(origin).origin !== consoleOrigin(request)
  ) {
    return NextResponse.json(
      { detail: 'Cross-origin request blocked.' },
      { status: 403 },
    );
  }
  const jar = await cookies();
  const session = jar.get(DEMO_SESSION_COOKIE)?.value;
  const authenticated = await verifyDemoSession(session);
  if (!authenticated)
    return NextResponse.json(
      { detail: 'Sign in to access FishEye.' },
      { status: 401 },
    );

  const apiBase = process.env.API_INTERNAL_URL;
  if (!apiBase)
    return NextResponse.json(
      { detail: 'The FishEye API is not configured for this deployment.' },
      { status: 503 },
    );
  let base: URL;
  try {
    base = new URL(apiBase);
    if (
      !['http:', 'https:'].includes(base.protocol) ||
      base.username ||
      base.password
    )
      throw new Error();
  } catch {
    return NextResponse.json(
      { detail: 'The FishEye API URL is invalid.' },
      { status: 503 },
    );
  }
  const { path } = await context.params;
  if (
    path.length < 2 ||
    path[0] !== 'api' ||
    path[1] !== 'v1' ||
    path.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.includes('/') ||
        part.includes('\\'),
    )
  ) {
    return NextResponse.json(
      { detail: 'The FishEye API path is invalid.' },
      { status: 400 },
    );
  }
  const prefix = base.pathname.replace(/\/$/, '');
  const target = new URL(
    `${prefix}/${path.map((part) => encodeURIComponent(part)).join('/')}`,
    base.origin,
  );
  target.search = requestUrl.search;
  const headers = new Headers();
  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (session) headers.set('authorization', `Bearer ${session}`);
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : await readBodyWithinLimit(request),
      cache: 'no-store',
      redirect: 'manual',
    });
    const responseHeaders = new Headers();
    for (const name of [
      'content-type',
      'content-disposition',
      'cache-control',
    ]) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ detail: error.message }, { status: 413 });
    }
    return NextResponse.json(
      { detail: 'The FishEye API could not be reached.' },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
