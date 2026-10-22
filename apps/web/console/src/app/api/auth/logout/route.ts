import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { LOCAL_SESSION_COOKIE } from '../../../../lib/local-auth';
import { consoleOrigin, SESSION_COOKIE } from '../../../../lib/oidc';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (
    origin &&
    new URL(origin).origin !== consoleOrigin(new URL(request.url).origin)
  )
    return new Response(null, { status: 403 });
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(LOCAL_SESSION_COOKIE);
  return NextResponse.redirect(
    new URL('/login', consoleOrigin(new URL(request.url).origin)),
    303,
  );
}
