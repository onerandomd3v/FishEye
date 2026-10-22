import * as oidc from 'openid-client';
import { NextResponse } from 'next/server';
import {
  oidcClient,
  oidcEnabled,
  OIDC_NONCE_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  redirectUri,
} from '../../../../lib/oidc';

export async function GET() {
  if (!oidcEnabled())
    return NextResponse.json(
      { error: 'OIDC sign-in is not configured for this deployment.' },
      { status: 503 },
    );
  try {
    const config = await oidcClient();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const parameters: Record<string, string> = {
      redirect_uri: redirectUri(),
      scope: process.env.FISHEYE_OIDC_SCOPES?.trim() || 'openid profile email',
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    };
    const resource = process.env.FISHEYE_OIDC_RESOURCE?.trim();
    if (resource) parameters.resource = resource;
    const response = NextResponse.redirect(
      oidc.buildAuthorizationUrl(config, parameters),
    );
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 600,
    };
    response.cookies.set(OIDC_STATE_COOKIE, state, options);
    response.cookies.set(OIDC_NONCE_COOKIE, nonce, options);
    response.cookies.set(OIDC_VERIFIER_COOKIE, verifier, options);
    return response;
  } catch {
    return NextResponse.json(
      {
        error:
          'OIDC sign-in could not be started. Check the server configuration.',
      },
      { status: 503 },
    );
  }
}
