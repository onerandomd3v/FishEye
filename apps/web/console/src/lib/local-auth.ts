import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const LOCAL_SESSION_COOKIE = 'fisheye_local_demo_session';
const SESSION_SUBJECT = 'local-demo-analyst';
const SESSION_LIFETIME = '8h';

function getSessionKey(): Uint8Array | null {
  const secret = process.env.FISHEYE_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

export async function createLocalSession(): Promise<string | null> {
  const key = getSessionKey();
  if (!key) return null;

  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(SESSION_SUBJECT)
    .setIssuedAt()
    .setExpirationTime(SESSION_LIFETIME)
    .sign(key);
}

export async function verifyLocalSession(
  token: string | undefined,
): Promise<boolean> {
  if (process.env.NODE_ENV !== 'development') return false;

  const key = getSessionKey();
  if (!token || !key) return false;

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    return payload.sub === SESSION_SUBJECT;
  } catch {
    return false;
  }
}

export function secureStringEquals(actual: string, expected: string): boolean {
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}
