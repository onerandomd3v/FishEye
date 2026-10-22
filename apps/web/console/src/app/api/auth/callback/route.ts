import * as oidc from 'openid-client';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  encryptSession,
  consoleOrigin,
  oidcClient,
  OIDC_NONCE_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  redirectUri,
  SESSION_COOKIE,
} from '../../../../lib/oidc';

export async function GET(request: Request) {
  const jar = await cookies();
  const state = jar.get(OIDC_STATE_COOKIE)?.value;
  const nonce = jar.get(OIDC_NONCE_COOKIE)?.value;
  const verifier = jar.get(OIDC_VERIFIER_COOKIE)?.value;
  if (!state || !nonce || !verifier)
    return NextResponse.redirect(new URL('/login?error=oidc', consoleOrigin()));
  try {
    const currentUrl = new URL(request.url);
    const expectedCallback = new URL(redirectUri());
    if (
      currentUrl.origin !== expectedCallback.origin ||
      currentUrl.pathname !== expectedCallback.pathname
    )
      throw new Error(
        'OIDC callback URL does not match configured redirect URI.',
      );
    const config = await oidcClient();
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      expectedState: state,
      expectedNonce: nonce,
      pkceCodeVerifier: verifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub || !tokens.access_token)
      throw new Error('OIDC response did not contain a user and API token.');
    const expiresAt =
      Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600);
    const session = await encryptSession({
      sub: claims.sub,
      accessToken: tokens.access_token,
      expiresAt,
    });
    const response = NextResponse.redirect(
      new URL('/overview', consoleOrigin()),
    );
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    });
    for (const name of [
      OIDC_STATE_COOKIE,
      OIDC_NONCE_COOKIE,
      OIDC_VERIFIER_COOKIE,
    ])
      response.cookies.set(name, '', { path: '/', maxAge: 0 });
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL('/login?error=oidc', consoleOrigin()),
    );
    for (const name of [
      OIDC_STATE_COOKIE,
      OIDC_NONCE_COOKIE,
      OIDC_VERIFIER_COOKIE,
    ])
      response.cookies.set(name, '', { path: '/', maxAge: 0 });
    return response;
  }
}
