import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GMAIL_PROFILE_ENDPOINT,
  gmailProfileEmail,
} from "./google-oauth-profile.ts";

Deno.test("Google OAuth identity uses the Gmail profile endpoint response", () => {
  assertEquals(
    GMAIL_PROFILE_ENDPOINT,
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
  );
  assertEquals(
    gmailProfileEmail({ emailAddress: " MatthewIrving99@Gmail.com " }),
    "matthewirving99@gmail.com",
  );
});

Deno.test("Gmail profile parsing does not fall back to the userinfo schema", () => {
  assertEquals(gmailProfileEmail({ email: "matthewirving99@gmail.com" }), null);
  assertEquals(gmailProfileEmail({ emailAddress: "" }), null);
  assertEquals(gmailProfileEmail({ error: { code: 401 } }), null);
});
