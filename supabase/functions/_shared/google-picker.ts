export type GooglePickerPublicConfiguration = Readonly<{
  oauthClientId: string;
  apiKey: string;
  cloudProjectNumber: string;
}>;

export function googlePickerPublicConfiguration(
  getEnvironment: (name: string) => string | undefined,
): GooglePickerPublicConfiguration | null {
  const oauthClientId = (
    getEnvironment("GOOGLE_OAUTH_CLIENT_ID") ??
      getEnvironment("GOOGLE_CLOUD_CLIENT_ID") ?? ""
  ).trim();
  const apiKey = (getEnvironment("GOOGLE_PICKER_API_KEY") ?? "").trim();
  const cloudProjectNumber = (
    getEnvironment("GOOGLE_CLOUD_PROJECT_NUMBER") ?? ""
  ).trim();
  if (!oauthClientId || !apiKey || !cloudProjectNumber) return null;
  return { oauthClientId, apiKey, cloudProjectNumber };
}
