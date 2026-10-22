import { describe, expect, it } from 'vitest';
import { oidcAuthorizationParameters } from './oidc-authorization-parameters';

describe('OIDC authorization parameters', () => {
  it('requests the configured API audience', () => {
    expect(
      oidcAuthorizationParameters({ FISHEYE_OIDC_AUDIENCE: ' fisheye-api ' }),
    ).toEqual({ audience: 'fisheye-api' });
  });

  it('preserves an optional resource indicator', () => {
    expect(
      oidcAuthorizationParameters({
        FISHEYE_OIDC_AUDIENCE: 'fisheye-api',
        FISHEYE_OIDC_RESOURCE: 'https://api.fisheye.test',
      }),
    ).toEqual({
      audience: 'fisheye-api',
      resource: 'https://api.fisheye.test',
    });
  });

  it('omits unset values', () => {
    expect(oidcAuthorizationParameters({})).toEqual({});
  });
});
