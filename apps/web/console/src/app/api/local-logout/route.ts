import { cookies } from 'next/headers';
import { LOCAL_SESSION_COOKIE } from '../../../lib/local-auth';

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(null, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.delete(LOCAL_SESSION_COOKIE);
  return new Response(null, { status: 204 });
}
