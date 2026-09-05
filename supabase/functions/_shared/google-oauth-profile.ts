export const GMAIL_PROFILE_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/profile";

export function gmailProfileEmail(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const emailAddress = (value as { emailAddress?: unknown }).emailAddress;
  if (typeof emailAddress !== "string") return null;
  const normalized = emailAddress.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}
