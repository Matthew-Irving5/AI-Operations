import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GOOGLE_USERINFO_ENDPOINT,
  googleUserInfoEmail,
} from "./google-oauth-profile.ts";

Deno.test("Google OAuth identity uses the account-neutral OpenID userinfo endpoint", () => {
  assertEquals(
    GOOGLE_USERINFO_ENDPOINT,
    "https://openidconnect.googleapis.com/v1/userinfo",
  );
  assertEquals(
    googleUserInfoEmail({
      email: " MatthewIrving99@Gmail.com ",
      email_verified: true,
    }),
    "matthewirving99@gmail.com",
  );
});

Deno.test("Google OAuth identity rejects absent or unverified email claims", () => {
  assertEquals(
    googleUserInfoEmail({ emailAddress: "person@example.com" }),
    null,
  );
  assertEquals(googleUserInfoEmail({ email: "person@example.com" }), null);
  assertEquals(
    googleUserInfoEmail({ email: "person@example.com", email_verified: false }),
    null,
  );
  assertEquals(googleUserInfoEmail({ email: "", email_verified: true }), null);
  assertEquals(googleUserInfoEmail({ error: { code: 401 } }), null);
});
