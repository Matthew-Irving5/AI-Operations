export function configureLocalAuthCallback(config: string, appPort: number): string {
  if (!Number.isInteger(appPort) || appPort < 1024 || appPort > 65_535) {
    throw new Error('The isolated local app port is invalid.');
  }

  const origin = `http://127.0.0.1:${appPort}`;
  const redirectUrls = [
    `  "${origin}/auth/callback",`,
    `  "http://localhost:${appPort}/auth/callback",`,
  ].join('\n');
  const siteUrlSetting = /^site_url\s*=\s*"[^"]*"/m;
  if (!siteUrlSetting.test(config))
    throw new Error('The local Auth site_url setting was not found.');
  const withSiteUrl = config.replace(siteUrlSetting, `site_url = "${origin}"`);

  const redirectSetting = /^additional_redirect_urls[ \t]*=[ \t]*\[[\s\S]*?^[ \t]*\]/m;
  if (!redirectSetting.test(withSiteUrl)) {
    throw new Error('The local Auth callback redirect setting was not found.');
  }
  const withRedirects = withSiteUrl.replace(
    redirectSetting,
    `additional_redirect_urls = [\n${redirectUrls}\n]`,
  );
  return withRedirects;
}
