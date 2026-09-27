export const GOOGLE_USERINFO_ENDPOINT =
  "https://openidconnect.googleapis.com/v1/userinfo";

export function googleUserInfoEmail(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const profile = value as { email?: unknown; email_verified?: unknown };
  if (profile.email_verified !== true || typeof profile.email !== "string") {
    return null;
  }
  const normalized = profile.email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
