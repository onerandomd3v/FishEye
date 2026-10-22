import 'server-only';

import * as oidc from 'openid-client';
import { createHash } from 'node:crypto';
import { EncryptJWT, compactDecrypt } from 'jose';

export const SESSION_COOKIE = 'fisheye_oidc_session';
export const OIDC_STATE_COOKIE = 'fisheye_oidc_state';
export const OIDC_NONCE_COOKIE = 'fisheye_oidc_nonce';
export const OIDC_VERIFIER_COOKIE = 'fisheye_oidc_verifier';
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

export type OidcSession = {
  sub: string;
  accessToken: string;
  expiresAt: number;
};

function setting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required OIDC setting: ${name}`);
  if (name === 'FISHEYE_SESSION_SECRET' && value.length < 32) {
    throw new Error(
      'FISHEYE_SESSION_SECRET must contain at least 32 characters.',
    );
  }
  return value;
}

export function oidcEnabled(): boolean {
  return Boolean(
    process.env.FISHEYE_OIDC_ISSUER &&
    process.env.FISHEYE_OIDC_CLIENT_ID &&
    process.env.FISHEYE_OIDC_CLIENT_SECRET &&
    process.env.FISHEYE_SESSION_SECRET,
  );
}

export async function oidcClient(): Promise<oidc.Configuration> {
  const issuer = new URL(setting('FISHEYE_OIDC_ISSUER'));
  if (issuer.protocol !== 'https:' && process.env.NODE_ENV !== 'development') {
    throw new Error(
      'The OIDC issuer must use HTTPS outside local development.',
    );
  }
  return oidc.discovery(
    issuer,
    setting('FISHEYE_OIDC_CLIENT_ID'),
    setting('FISHEYE_OIDC_CLIENT_SECRET'),
  );
}

export function redirectUri(): string {
  const value =
    process.env.FISHEYE_OIDC_REDIRECT_URI?.trim() ||
    `${setting('FISHEYE_CONSOLE_URL').replace(/\/$/, '')}/api/auth/callback`;
  const uri = new URL(value);
  if (process.env.NODE_ENV !== 'development' && uri.protocol !== 'https:') {
    throw new Error(
      'The OIDC callback must use HTTPS outside local development.',
    );
  }
  return uri.href;
}

export function consoleOrigin(request?: Request): string {
  const configured = process.env.FISHEYE_CONSOLE_URL?.trim();
  if (configured) return new URL(configured).origin;
  if (process.env.FISHEYE_OIDC_REDIRECT_URI?.trim()) {
    return new URL(process.env.FISHEYE_OIDC_REDIRECT_URI).origin;
  }
  if (process.env.NODE_ENV === 'development' && request) {
    return new URL(request.url).origin;
  }
  throw new Error(
    'FISHEYE_CONSOLE_URL must be configured outside local development.',
  );
}

function encryptionKey(): Uint8Array {
  return createHash('sha256')
    .update(setting('FISHEYE_SESSION_SECRET'), 'utf8')
    .digest();
}

export async function encryptSession(session: OidcSession): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Math.min(session.expiresAt, now + SESSION_LIFETIME_SECONDS);
  return new EncryptJWT({ accessToken: session.accessToken })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setSubject(session.sub)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .encrypt(encryptionKey());
}

export async function decryptSession(
  value: string | undefined,
): Promise<OidcSession | null> {
  if (!value) return null;
  try {
    const { plaintext } = await compactDecrypt(value, encryptionKey(), {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
    const claims = JSON.parse(new TextDecoder().decode(plaintext)) as Record<
      string,
      unknown
    >;
    const { sub, accessToken, exp } = claims;
    if (
      typeof sub !== 'string' ||
      !sub ||
      typeof accessToken !== 'string' ||
      !accessToken ||
      typeof exp !== 'number' ||
      exp <= Math.floor(Date.now() / 1000)
    )
      return null;
    return { sub, accessToken, expiresAt: exp };
  } catch {
    return null;
  }
}
