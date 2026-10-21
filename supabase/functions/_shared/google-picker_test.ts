import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { googlePickerPublicConfiguration } from "./google-picker.ts";

Deno.test("Google Picker configuration exposes only public bounded runtime values", () => {
  const values: Record<string, string> = {
    GOOGLE_OAUTH_CLIENT_ID: " web-client.apps.googleusercontent.com ",
    GOOGLE_PICKER_API_KEY: " restricted-browser-key ",
    GOOGLE_CLOUD_PROJECT_NUMBER: " 1234567890 ",
    GOOGLE_OAUTH_CLIENT_SECRET: "must-not-be-returned",
  };
  const config = googlePickerPublicConfiguration((name) => values[name]);

  assertEquals(config, {
    oauthClientId: "web-client.apps.googleusercontent.com",
    apiKey: "restricted-browser-key",
    cloudProjectNumber: "1234567890",
  });
});

Deno.test("Google Picker remains unavailable unless every public setup value exists", () => {
  assertEquals(
    googlePickerPublicConfiguration((name) =>
      name === "GOOGLE_PICKER_API_KEY" ? "restricted-browser-key" : undefined
    ),
    null,
  );
});
