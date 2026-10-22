import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { consoleOrigin, DEMO_SESSION_COOKIE } from '../../../../lib/demo-auth';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  try {
    if (origin && new URL(origin).origin !== consoleOrigin(request)) {
      return new Response(null, { status: 403 });
    }
    const cookieStore = await cookies();
    cookieStore.delete(DEMO_SESSION_COOKIE);
    return NextResponse.redirect(
      new URL('/login', consoleOrigin(request)),
      303,
    );
  } catch {
    return new Response(null, { status: 503 });
  }
}
