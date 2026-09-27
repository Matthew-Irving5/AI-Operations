import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GOOGLE_ACCOUNT_EMAILS,
  GOOGLE_ROLE_SCOPES,
  googleAccountConfig,
  hasExactScopes,
  isGoogleAccountRole,
  isGoogleRoleAvailableInEnvironment,
  scopesForGoogleRole,
} from "./google-account-config.ts";

Deno.test("Google account roles bind to one mailbox per deployment environment", () => {
  assertEquals(
    googleAccountConfig(
      "production",
      "https://ai-operations-production.ai-operations.workers.dev",
    )?.accounts,
    {
      personal_data_source: "matthewirving99@gmail.com",
      ai_operations_mailbox: "matthew.irving.ai@gmail.com",
      ai_operations_mailbox_staging: "matthew.irving.ai.staging@gmail.com",
    },
  );
  assertEquals(
    googleAccountConfig(
      "staging",
      "https://ai-operations-staging.ai-operations.workers.dev",
    )?.accounts,
    {
      personal_data_source: "matthewirving99@gmail.com",
      ai_operations_mailbox: "matthew.irving.ai@gmail.com",
      ai_operations_mailbox_staging: "matthew.irving.ai.staging@gmail.com",
    },
  );
});

Deno.test("Google account configuration rejects missing, swapped, and unknown environments", () => {
  assertEquals(googleAccountConfig(undefined, undefined), null);
  assertEquals(
    googleAccountConfig(
      undefined,
      "https://ai-operations-production.ai-operations.workers.dev",
    )?.environment,
    "production",
  );
  assertEquals(
    googleAccountConfig(
      "production",
      "https://ai-operations-staging.ai-operations.workers.dev",
    ),
    null,
  );
  assertEquals(
    googleAccountConfig("preview", "https://preview.example.test"),
    null,
  );
});

Deno.test("Google role scope sets isolate personal data from communication mailboxes", () => {
  const personal = scopesForGoogleRole("personal_data_source");
  const mailbox = scopesForGoogleRole("ai_operations_mailbox");
  assertEquals(personal, [
    "openid",
    "email",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events.owned",
    "https://www.googleapis.com/auth/tasks",
  ]);
  assertEquals(mailbox, [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ]);
  assertEquals(
    GOOGLE_ACCOUNT_EMAILS.personal_data_source,
    "matthewirving99@gmail.com",
  );
  assertEquals(GOOGLE_ROLE_SCOPES.ai_operations_mailbox, mailbox);
  assertEquals(scopesForGoogleRole("ai_operations_mailbox_staging"), mailbox);
  assert(isGoogleRoleAvailableInEnvironment("personal_data_source", "staging"));
  assert(
    isGoogleRoleAvailableInEnvironment("ai_operations_mailbox", "production"),
  );
  assert(
    isGoogleRoleAvailableInEnvironment(
      "ai_operations_mailbox_staging",
      "staging",
    ),
  );
  assertEquals(
    isGoogleRoleAvailableInEnvironment("ai_operations_mailbox", "staging"),
    false,
  );
  assertEquals(
    isGoogleRoleAvailableInEnvironment(
      "ai_operations_mailbox_staging",
      "production",
    ),
    false,
  );
});

Deno.test("Google role and scope validators reject unapproved values", () => {
  assert(isGoogleAccountRole("personal_data_source"));
  assert(isGoogleAccountRole("ai_operations_mailbox"));
  assert(isGoogleAccountRole("ai_operations_mailbox_staging"));
  assertEquals(isGoogleAccountRole("production"), false);
  assert(hasExactScopes(["openid", "email"], ["email", "openid"]));
  assertEquals(hasExactScopes(["openid", "openid"], ["openid"]), false);
  assertEquals(hasExactScopes(["openid", "email"], ["openid"]), false);
});
