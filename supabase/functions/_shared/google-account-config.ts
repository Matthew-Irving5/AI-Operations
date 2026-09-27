export const GOOGLE_ACCOUNT_ROLES = [
  "personal_data_source",
  "ai_operations_mailbox",
  "ai_operations_mailbox_staging",
] as const;

export type GoogleAccountRole = (typeof GOOGLE_ACCOUNT_ROLES)[number];
export type GoogleEnvironment = "staging" | "production";

export const GOOGLE_ACCOUNT_EMAILS = Object.freeze({
  personal_data_source: "matthewirving99@gmail.com",
  ai_operations_mailbox: Object.freeze({
    staging: "matthew.irving.ai.staging@gmail.com",
    production: "matthew.irving.ai@gmail.com",
  }),
});

export const GOOGLE_ROLE_SCOPES = Object.freeze({
  personal_data_source: Object.freeze([
    "openid",
    "email",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events.owned",
    "https://www.googleapis.com/auth/tasks",
  ]),
  ai_operations_mailbox: Object.freeze([
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ]),
  ai_operations_mailbox_staging: Object.freeze([
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ]),
});

export type GoogleAccountConfig = Readonly<{
  environment: GoogleEnvironment;
  appOrigin: string;
  accounts: Readonly<Record<GoogleAccountRole, string>>;
}>;

export function googleAccountConfig(
  environment: string | undefined,
  appOrigin: string | undefined,
): GoogleAccountConfig | null {
  const originEnvironment = appOrigin ===
      "https://ai-operations-staging.ai-operations.workers.dev"
    ? "staging"
    : appOrigin ===
        "https://ai-operations-production.ai-operations.workers.dev"
    ? "production"
    : null;
  if (
    !originEnvironment || (environment && environment !== originEnvironment)
  ) {
    return null;
  }
  const expectedOrigin = originEnvironment === "staging"
    ? "https://ai-operations-staging.ai-operations.workers.dev"
    : "https://ai-operations-production.ai-operations.workers.dev";
  if (appOrigin !== expectedOrigin) return null;
  return {
    environment: originEnvironment,
    appOrigin: expectedOrigin,
    accounts: {
      personal_data_source: GOOGLE_ACCOUNT_EMAILS.personal_data_source,
      ai_operations_mailbox:
        GOOGLE_ACCOUNT_EMAILS.ai_operations_mailbox.production,
      ai_operations_mailbox_staging:
        GOOGLE_ACCOUNT_EMAILS.ai_operations_mailbox.staging,
    },
  };
}

export function isGoogleAccountRole(
  value: unknown,
): value is GoogleAccountRole {
  return typeof value === "string" &&
    (GOOGLE_ACCOUNT_ROLES as readonly string[]).includes(value);
}

export function scopesForGoogleRole(
  role: GoogleAccountRole,
): readonly string[] {
  return GOOGLE_ROLE_SCOPES[role];
}

export function isGoogleRoleAvailableInEnvironment(
  role: GoogleAccountRole,
  environment: GoogleEnvironment,
): boolean {
  return role === "personal_data_source" ||
    (role === "ai_operations_mailbox" && environment === "production") ||
    (role === "ai_operations_mailbox_staging" && environment === "staging");
}

export function hasExactScopes(
  received: readonly string[],
  expected: readonly string[],
): boolean {
  const actualSet = new Set(received);
  const expectedSet = new Set(expected);
  return actualSet.size === received.length &&
    expectedSet.size === expected.length &&
    actualSet.size === expectedSet.size &&
    [...actualSet].every((scope) => expectedSet.has(scope));
}
