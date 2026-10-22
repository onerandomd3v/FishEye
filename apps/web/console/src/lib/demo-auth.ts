import { timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const DEMO_SESSION_COOKIE = 'fisheye_demo_session';
export const DEMO_TOKEN_ISSUER = 'fisheye-console';
export const DEMO_TOKEN_AUDIENCE = 'fisheye-api';
export const DEMO_SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

function sessionKey(): Uint8Array | null {
  const secret = process.env.FISHEYE_SESSION_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return null;
  return Buffer.from(secret, 'utf8');
}

export function demoLoginConfigured(): boolean {
  const password = process.env.FISHEYE_DEMO_PASSWORD;
  return Boolean(
    process.env.FISHEYE_DEMO_EMAIL?.trim() &&
    password &&
    Buffer.byteLength(password, 'utf8') >= 12 &&
    Buffer.byteLength(password, 'utf8') <= 1024 &&
    sessionKey(),
  );
}

export async function createDemoSession(email: string): Promise<string | null> {
  const key = sessionKey();
  if (!key) return null;
  return new SignJWT({ roles: ['analyst'] })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(DEMO_TOKEN_ISSUER)
    .setAudience(DEMO_TOKEN_AUDIENCE)
    .setSubject(email.trim().toLowerCase())
    .setIssuedAt()
    .setExpirationTime(`${DEMO_SESSION_LIFETIME_SECONDS}s`)
    .sign(key);
}

export async function verifyDemoSession(
  token: string | undefined,
): Promise<boolean> {
  const key = sessionKey();
  if (!token || !key) return false;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: DEMO_TOKEN_ISSUER,
      audience: DEMO_TOKEN_AUDIENCE,
    });
    return (
      typeof payload.sub === 'string' &&
      payload.sub.length > 0 &&
      Array.isArray(payload.roles) &&
      payload.roles.includes('analyst')
    );
  } catch {
    return false;
  }
}

export function secureStringEquals(actual: string, expected: string): boolean {
  const maxLength = 1024;
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (actualBytes.length > maxLength || expectedBytes.length > maxLength) {
    return false;
  }
  const paddedActual = Buffer.alloc(maxLength);
  const paddedExpected = Buffer.alloc(maxLength);
  actualBytes.copy(paddedActual);
  expectedBytes.copy(paddedExpected);
  return (
    timingSafeEqual(paddedActual, paddedExpected) &&
    actualBytes.length === expectedBytes.length
  );
}

export function consoleOrigin(request?: Request): string {
  const configured = process.env.FISHEYE_CONSOLE_URL?.trim();
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === 'development' && request) {
    return new URL(request.url).origin;
  }
  throw new Error(
    'FISHEYE_CONSOLE_URL must be configured outside local development.',
  );
}
