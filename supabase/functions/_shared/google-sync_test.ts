import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  APPROVED_GOOGLE_SCOPES,
  hasExactGoogleScopes,
  shouldRecoverGmailHistoryCursor,
} from "./google-sync.ts";

Deno.test("Google scope contract accepts exactly the four approved scopes", () => {
  assert(hasExactGoogleScopes([...APPROVED_GOOGLE_SCOPES]));
  assert(hasExactGoogleScopes([...APPROVED_GOOGLE_SCOPES].reverse()));
});

Deno.test("Google scope contract rejects missing, extra, and duplicate scopes", () => {
  assertEquals(hasExactGoogleScopes(APPROVED_GOOGLE_SCOPES.slice(0, 3)), false);
  assertEquals(
    hasExactGoogleScopes([
      ...APPROVED_GOOGLE_SCOPES,
      "https://www.googleapis.com/auth/contacts.readonly",
    ]),
    false,
  );
  assertEquals(
    hasExactGoogleScopes([
      ...APPROVED_GOOGLE_SCOPES,
      APPROVED_GOOGLE_SCOPES[0],
    ]),
    false,
  );
});

Deno.test("Gmail history recovery is bounded to one baseline", () => {
  assert(shouldRecoverGmailHistoryCursor(404, false));
  assert(shouldRecoverGmailHistoryCursor(400, false));
  assertEquals(shouldRecoverGmailHistoryCursor(404, true), false);
  assertEquals(shouldRecoverGmailHistoryCursor(500, false), false);
});
