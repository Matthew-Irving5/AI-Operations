export function liveE2eBrowserEnvironment(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const browserEnvironment = { ...env };
  delete browserEnvironment.STAGING_PERSONAL_ACCESS_TOKEN;
  return browserEnvironment;
}
