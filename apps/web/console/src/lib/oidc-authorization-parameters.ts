type OidcAuthorizationEnvironment = Readonly<
  Record<string, string | undefined>
>;

export function oidcAuthorizationParameters(
  environment: OidcAuthorizationEnvironment = process.env,
): Record<string, string> {
  const parameters: Record<string, string> = {};
  const audience = environment.FISHEYE_OIDC_AUDIENCE?.trim();
  const resource = environment.FISHEYE_OIDC_RESOURCE?.trim();

  if (audience) parameters.audience = audience;
  if (resource) parameters.resource = resource;

  return parameters;
}
