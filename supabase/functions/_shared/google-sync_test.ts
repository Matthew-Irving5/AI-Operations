import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  APPROVED_GOOGLE_SCOPES,
  fetchSelectedDriveFiles,
  GoogleSyncError,
  hasExactGoogleRoleScopes,
  hasExactGoogleScopes,
  selectedDriveChanges,
  shouldRecoverGmailHistoryCursor,
  shouldSeedGmailCursor,
} from "./google-sync.ts";

Deno.test("Google personal-data scope contract accepts exactly its six approved scopes", () => {
  assert(hasExactGoogleScopes([...APPROVED_GOOGLE_SCOPES]));
  assert(hasExactGoogleScopes([...APPROVED_GOOGLE_SCOPES].reverse()));
});

Deno.test("Google communication roles permit Gmail only and share a distinct environment binding", () => {
  const scopes = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ];
  assert(hasExactGoogleRoleScopes("ai_operations_mailbox", scopes));
  assert(hasExactGoogleRoleScopes("ai_operations_mailbox_staging", scopes));
  assertEquals(
    hasExactGoogleRoleScopes("ai_operations_mailbox", [
      ...scopes,
      "https://www.googleapis.com/auth/calendar.readonly",
    ]),
    false,
  );
});

Deno.test("Google scope contract rejects missing, extra, and duplicate scopes", () => {
  assertEquals(hasExactGoogleScopes(APPROVED_GOOGLE_SCOPES.slice(0, 5)), false);
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

Deno.test("Gmail first sync seeds a cursor instead of enumerating an unbounded Inbox", () => {
  assert(shouldSeedGmailCursor(null));
  assertEquals(shouldSeedGmailCursor("123456"), false);
});

Deno.test("Google sync errors retain safe stage and provider diagnostics", () => {
  const error = new GoogleSyncError(
    "provider_request_failed",
    403,
    "calendar_list",
    "accessnotconfigured",
  );
  assertEquals(error.message, "provider_request_failed");
  assertEquals(error.stage, "calendar_list");
  assertEquals(error.status, 403);
  assertEquals(error.providerError, "accessnotconfigured");
});

Deno.test("Drive metadata discovery fetches only the persisted selected file IDs", async () => {
  const requestedUrls: string[] = [];
  const files = await fetchSelectedDriveFiles(
    ["selected-file-1", "selected/file-2"],
    { authorization: "Bearer test-token" },
    (input) => {
      const url = String(input);
      requestedUrls.push(url);
      const id = decodeURIComponent(url.split("/files/")[1].split("?")[0]);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id,
            name: `Selected ${id}`,
            mimeType: "text/plain",
          }),
          { status: 200 },
        ),
      );
    },
  );

  assertEquals(requestedUrls, [
    "https://www.googleapis.com/drive/v3/files/selected-file-1?fields=id%2Cname%2CmimeType%2CmodifiedTime%2Cmd5Checksum%2Ctrashed",
    "https://www.googleapis.com/drive/v3/files/selected%2Ffile-2?fields=id%2Cname%2CmimeType%2CmodifiedTime%2Cmd5Checksum%2Ctrashed",
  ]);
  assertEquals(files.map((file) => file.id), [
    "selected-file-1",
    "selected/file-2",
  ]);
  assertEquals(requestedUrls.some((url) => url.includes("/files?")), false);
});

Deno.test("Drive change pages are filtered by persisted selection before metadata fetch", () => {
  assertEquals(
    selectedDriveChanges([
      { fileId: "selected-file", removed: false },
      { fileId: "unselected-file", removed: false },
      { fileId: "selected-removed", removed: true },
      { removed: true },
    ], new Set(["selected-file", "selected-removed"])),
    [
      { fileId: "selected-file", removed: false },
      { fileId: "selected-removed", removed: true },
    ],
  );
});
