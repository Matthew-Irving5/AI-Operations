import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

export const APPROVED_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
] as const;

const GOOGLE_SCOPE_SET = new Set<string>(APPROVED_GOOGLE_SCOPES);

export function hasExactGoogleScopes(scopes: readonly string[]): boolean {
  const unique = new Set(scopes);
  return unique.size === GOOGLE_SCOPE_SET.size &&
    unique.size === scopes.length &&
    [...unique].every((scope) => GOOGLE_SCOPE_SET.has(scope));
}

export function shouldRecoverGmailHistoryCursor(
  status: number,
  alreadyRecovered: boolean,
): boolean {
  return !alreadyRecovered && (status === 400 || status === 404);
}

export type GoogleDataset = "google_gmail" | "google_calendar" | "google_drive";
export type FreshnessState =
  | "fresh"
  | "stale"
  | "error"
  | "reauthentication_required"
  | "not_connected";

export type GoogleSyncResult = {
  connection_id: string;
  user_id: string;
  ok: boolean;
  datasets: {
    gmail: DatasetResult;
    calendar: DatasetResult;
    drive: DatasetResult;
  };
};

export type DatasetResult = {
  state: FreshnessState;
  count: number;
  reason?: string;
};

type ConnectionRow = {
  id: string;
  user_id: string;
  status: string;
  sync_enabled: boolean;
  scopes: string[];
  configuration: Record<string, unknown>;
};
type CredentialRow = { encrypted_refresh_token: string };
type CalendarListItem = { id: string; summary?: string; timeZone?: string };
type CalendarEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  updated?: string;
  status?: string;
  recurrence?: string[];
};
type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  md5Checksum?: string;
};
type GmailMessage = { id: string; threadId?: string };
type GmailHistory = {
  historyId?: string;
  nextPageToken?: string;
  messagesAdded?: Array<{ message?: GmailMessage }>;
  labelsAdded?: Array<{ message?: GmailMessage }>;
  messagesDeleted?: Array<{ message?: GmailMessage }>;
  messages?: GmailMessage[];
};
type GmailDetail = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
};
type CalendarPage = {
  items?: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};
type DrivePage = {
  files?: DriveFile[];
  nextPageToken?: string;
  nextPageTokenForItems?: string;
  newStartPageToken?: string;
  changes?: Array<{
    file?: DriveFile & { trashed?: boolean };
    fileId?: string;
    removed?: boolean;
  }>;
};

type SyncOptions = {
  database: SupabaseClient;
  connectionId: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export type GoogleSourceDiscovery = {
  calendars: Array<{ id: string; summary: string; timeZone: string | null }>;
  driveFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string | null;
  }>;
};

const MAX_PROVIDER_PAGES = 100;

function selectedIds(configuration: Record<string, unknown>, key: string) {
  const value = configuration[key];
  return {
    // Source permissions are opt-in: an absent or empty selection ingests none.
    enabled: true,
    ids: new Set(
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    ),
  };
}

async function readCursor(
  database: SupabaseClient,
  connectionId: string,
  resourceType: string,
  resourceId: string,
): Promise<string | null> {
  const result = await database.from("integration_cursors").select("cursor")
    .eq("connection_id", connectionId).eq("resource_type", resourceType)
    .eq("resource_id", resourceId).maybeSingle()
    .returns<{ cursor: string | null }>();
  if (result.error) throw new GoogleSyncError("cursor_read_failed");
  return result.data?.cursor ?? null;
}

async function writeCursor(
  database: SupabaseClient,
  connection: ConnectionRow,
  resourceType: string,
  resourceId: string,
  cursor: string,
): Promise<void> {
  if (!cursor || /^\d{4}-\d{2}-\d{2}T/.test(cursor)) {
    throw new GoogleSyncError("provider_cursor_invalid");
  }
  const result = await database.from("integration_cursors").upsert({
    user_id: connection.user_id,
    connection_id: connection.id,
    resource_type: resourceType,
    resource_id: resourceId,
    cursor,
  }, { onConflict: "connection_id,resource_type,resource_id" });
  if (result.error) throw new GoogleSyncError("persistence_failed");
}

function providerErrorCode(value: unknown): string | undefined {
  const candidate = typeof value === "string"
    ? value
    : typeof value === "object" && value !== null
    ? ["error", "status", "reason", "code"].map((key) =>
      (value as Record<string, unknown>)[key]
    ).find((item): item is string => typeof item === "string")
    : undefined;
  if (!candidate) return undefined;
  const normalized = candidate.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{0,63}$/.test(normalized)
    ? normalized
    : undefined;
}

export class GoogleSyncError extends Error {
  readonly safeCode: string;
  readonly status?: number;
  readonly stage: string;
  readonly providerError?: string;
  constructor(
    safeCode: string,
    status?: number,
    stage = "google_sync",
    providerError?: string,
  ) {
    super(safeCode);
    this.name = "GoogleSyncError";
    this.safeCode = safeCode;
    this.status = status;
    this.stage = stage;
    this.providerError = providerError;
  }
}

const environment = (preferred: string, compatibility: string) =>
  Deno.env.get(preferred) ?? Deno.env.get(compatibility);

function base64Decode(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(
    atob(value),
    (character) => character.charCodeAt(0),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

async function decryptRefreshToken(payload: string): Promise<string> {
  const raw = Deno.env.get("APP_TOKEN_ENCRYPTION_KEY");
  const [noncePart, ciphertextPart] = payload.split(".");
  if (!raw || !noncePart || !ciphertextPart) {
    throw new GoogleSyncError("credential_decryption_failed");
  }
  const keyBytes = base64Decode(raw);
  if (keyBytes.byteLength !== 32) {
    throw new GoogleSyncError("credential_decryption_failed");
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64Decode(noncePart) },
      key,
      base64Decode(ciphertextPart),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new GoogleSyncError("credential_decryption_failed");
  }
}

async function getAccessToken(refreshToken: string, fetchImpl: typeof fetch) {
  const clientId = environment(
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_CLOUD_CLIENT_ID",
  );
  const clientSecret = environment(
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_CLOUD_CLIENT_SECRET",
  );
  if (!clientId || !clientSecret) {
    throw new GoogleSyncError("google_oauth_not_configured");
  }
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const value = await response.json().catch(() => null) as {
    access_token?: string;
    error?: unknown;
  } | null;
  if (!response.ok || !value?.access_token) {
    throw new GoogleSyncError(
      "token_refresh_failed",
      response.status,
      "token_refresh",
      providerErrorCode(value),
    );
  }
  return value.access_token;
}

export async function discoverGoogleSources(
  database: SupabaseClient,
  connectionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleSourceDiscovery> {
  const result = await database.from("connections").select(
    "id,user_id,status,sync_enabled,scopes,configuration",
  ).eq("id", connectionId).eq("provider", "google").maybeSingle()
    .returns<ConnectionRow>();
  if (
    result.error || !result.data || result.data.status !== "connected" ||
    !result.data.sync_enabled
  ) {
    throw new GoogleSyncError(
      "connection_unavailable",
      undefined,
      "connection_lookup",
    );
  }
  if (!hasExactGoogleScopes(result.data.scopes)) {
    throw new GoogleSyncError(
      "google_scopes_invalid",
      undefined,
      "scope_validation",
    );
  }
  const credential = await database.from("connection_credentials").select(
    "encrypted_refresh_token",
  ).eq("connection_id", connectionId).maybeSingle().returns<CredentialRow>();
  if (credential.error || !credential.data) {
    throw new GoogleSyncError(
      "credential_unavailable",
      undefined,
      "credential_lookup",
    );
  }
  const accessToken = await getAccessToken(
    await decryptRefreshToken(credential.data.encrypted_refresh_token),
    fetchImpl,
  );
  const headers = { authorization: `Bearer ${accessToken}` };
  const calendars: GoogleSourceDiscovery["calendars"] = [];
  let calendarPageToken: string | undefined;
  let calendarPageCount = 0;
  do {
    const params = new URLSearchParams({ maxResults: "250" });
    if (calendarPageToken) params.set("pageToken", calendarPageToken);
    const response = await fetchImpl(
      `https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`,
      { headers },
    );
    const payload = await readJson(response) as {
      items?: CalendarListItem[];
      nextPageToken?: string;
    } | null;
    if (!response.ok || !payload) {
      throw new GoogleSyncError(
        "provider_request_failed",
        response.status,
        "calendar_list",
        providerErrorCode(payload),
      );
    }
    for (const item of payload.items ?? []) {
      if (item.id) {
        calendars.push({
          id: item.id,
          summary: item.summary ?? item.id,
          timeZone: item.timeZone ?? null,
        });
      }
    }
    calendarPageToken = payload.nextPageToken;
    if (++calendarPageCount > MAX_PROVIDER_PAGES) {
      throw new GoogleSyncError("provider_page_limit");
    }
  } while (calendarPageToken);
  const driveFiles: GoogleSourceDiscovery["driveFiles"] = [];
  let drivePageToken: string | undefined;
  let drivePageCount = 0;
  do {
    const params = new URLSearchParams({
      pageSize: "100",
      q: "trashed = false",
      fields: "files(id,name,mimeType,modifiedTime),nextPageToken",
    });
    if (drivePageToken) params.set("pageToken", drivePageToken);
    const response = await fetchImpl(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers },
    );
    const payload = await readJson(response) as DrivePage | null;
    if (!response.ok || !payload) {
      throw new GoogleSyncError(
        "provider_request_failed",
        response.status,
        "drive_files",
        providerErrorCode(payload),
      );
    }
    for (const file of payload.files ?? []) {
      if (file.id && file.name && file.mimeType) {
        driveFiles.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime ?? null,
        });
      }
    }
    drivePageToken = payload.nextPageToken;
    if (++drivePageCount > MAX_PROVIDER_PAGES) {
      throw new GoogleSyncError("provider_page_limit");
    }
  } while (drivePageToken);
  return { calendars, driveFiles };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readJson(response: Response): Promise<unknown> {
  return await response.json().catch(() => null);
}

async function setFreshness(
  database: SupabaseClient,
  userId: string,
  source: GoogleDataset,
  state: FreshnessState,
  reason: string | null,
  evidence: Record<string, unknown>,
  now: Date,
): Promise<void> {
  const result = await database.rpc("record_source_freshness", {
    p_user_id: userId,
    p_source: source,
    p_last_source_at: state === "fresh" ? now.toISOString() : null,
    p_last_success_at: state === "fresh" ? now.toISOString() : null,
    p_expected_cadence: "24 hours",
    p_state: state,
    p_stale_reason: reason,
    p_evidence: evidence,
  });
  if (result.error) throw new GoogleSyncError("freshness_persistence_failed");
}

function failedDataset(reason: string): DatasetResult {
  return { state: "error", count: 0, reason };
}

export async function syncGoogleConnection({
  database,
  connectionId,
  fetchImpl = fetch,
  now = () => new Date(),
}: SyncOptions): Promise<GoogleSyncResult> {
  const currentTime = now();
  const connectionResult = await database.from("connections").select(
    "id,user_id,status,sync_enabled,scopes,configuration",
  ).eq("id", connectionId).eq("provider", "google").maybeSingle()
    .returns<ConnectionRow>();
  if (connectionResult.error || !connectionResult.data) {
    throw new GoogleSyncError("connection_unavailable");
  }
  const connection = connectionResult.data;
  if (connection.status !== "connected" || !connection.sync_enabled) {
    throw new GoogleSyncError("connection_unavailable");
  }
  if (!hasExactGoogleScopes(connection.scopes)) {
    throw new GoogleSyncError("google_scopes_invalid");
  }

  const credentialResult = await database.from("connection_credentials").select(
    "encrypted_refresh_token",
  ).eq("connection_id", connection.id).maybeSingle().returns<CredentialRow>();
  if (credentialResult.error || !credentialResult.data) {
    throw new GoogleSyncError("credential_unavailable");
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(
      await decryptRefreshToken(credentialResult.data.encrypted_refresh_token),
      fetchImpl,
    );
  } catch (error) {
    const reason = error instanceof GoogleSyncError
      ? error.safeCode
      : "token_refresh_failed";
    await database.from("connections").update({
      status: "reauthentication_required",
      sync_enabled: false,
    }).eq("id", connection.id).eq("user_id", connection.user_id);
    for (
      const dataset of [
        "google_gmail",
        "google_calendar",
        "google_drive",
      ] as const
    ) {
      await setFreshness(
        database,
        connection.user_id,
        dataset,
        "reauthentication_required",
        "reauthentication_required",
        { operation: "google_sync", provider_request: false },
        currentTime,
      ).catch(() => undefined);
    }
    throw new GoogleSyncError(reason);
  }

  const headers = { authorization: `Bearer ${accessToken}` };
  let gmail = failedDataset("provider_request_failed");
  let calendar = failedDataset("provider_request_failed");
  let drive = failedDataset("provider_request_failed");
  let gmailPersisted = 0;
  let calendarPersisted = 0;
  let drivePersisted = 0;
  let gmailProviderComplete = false;
  let calendarProviderComplete = false;
  let driveProviderComplete = false;

  // Gmail list and each metadata request must succeed before Gmail freshness
  // can become fresh. The endpoint never requests message bodies or mutates mail.
  try {
    const profileResponse = await fetchImpl(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers },
    );
    const profile = await readJson(profileResponse) as
      | { historyId?: string }
      | null;
    if (!profileResponse.ok || !profile?.historyId) {
      throw new GoogleSyncError("provider_request_failed");
    }
    const previousCursor = await readCursor(
      database,
      connection.id,
      "gmail",
      "INBOX",
    );
    const messages = new Map<string, GmailMessage>();
    const deletedMessageIds = new Set<string>();
    let providerHistoryId = profile.historyId;
    let useHistory = Boolean(previousCursor);
    let baselineRecovered = false;
    let pageToken: string | undefined;
    let pageCount = 0;
    do {
      const params = new URLSearchParams({ maxResults: "100" });
      if (useHistory && previousCursor) {
        params.set("startHistoryId", previousCursor);
        params.append("historyTypes", "messageAdded");
        params.append("historyTypes", "messageLabelAdded");
        params.append("historyTypes", "messageDeleted");
        if (pageToken) params.set("pageToken", pageToken);
        const response = await fetchImpl(
          `https://gmail.googleapis.com/gmail/v1/users/me/history?${params}`,
          { headers },
        );
        const history = await readJson(response) as GmailHistory | null;
        if (!response.ok || !history) {
          if (
            shouldRecoverGmailHistoryCursor(response.status, baselineRecovered)
          ) {
            useHistory = false;
            baselineRecovered = true;
            pageToken = undefined;
            continue;
          }
          if (response.status === 404 || response.status === 400) {
            throw new GoogleSyncError("gmail_history_cursor_invalid");
          }
          throw new GoogleSyncError("provider_request_failed");
        }
        providerHistoryId = history.historyId ?? providerHistoryId;
        for (
          const entry of [
            ...(history.messagesAdded ?? []),
            ...(history.labelsAdded ?? []),
          ]
        ) {
          if (entry.message?.id) messages.set(entry.message.id, entry.message);
        }
        for (const entry of history.messagesDeleted ?? []) {
          if (entry.message?.id) deletedMessageIds.add(entry.message.id);
        }
        for (const message of history.messages ?? []) {
          if (message.id) messages.set(message.id, message);
        }
        pageToken = history.nextPageToken;
      } else {
        params.set("labelIds", "INBOX");
        if (pageToken) params.set("pageToken", pageToken);
        const response = await fetchImpl(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
          { headers },
        );
        const list = await readJson(response) as
          | { messages?: GmailMessage[]; nextPageToken?: string }
          | null;
        if (!response.ok || !list) {
          throw new GoogleSyncError("provider_request_failed");
        }
        for (const message of list.messages ?? []) {
          if (message.id) messages.set(message.id, message);
        }
        pageToken = list.nextPageToken;
      }
      pageCount += 1;
      if (pageCount > MAX_PROVIDER_PAGES) {
        throw new GoogleSyncError("provider_page_limit");
      }
    } while (pageToken);
    let count = 0;
    for (const message of messages.values()) {
      if (!message.id) continue;
      const detailResponse = await fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${
          encodeURIComponent(message.id)
        }?format=metadata`,
        { headers },
      );
      const detail = await readJson(detailResponse) as GmailDetail | null;
      if (
        !detailResponse.ok || !detail?.id || !detail.threadId ||
        !detail.internalDate
      ) {
        throw new GoogleSyncError("provider_request_failed");
      }
      const stored = await database.from("google_messages").upsert({
        user_id: connection.user_id,
        connection_id: connection.id,
        gmail_message_id: detail.id,
        thread_id: detail.threadId,
        label_ids: detail.labelIds ?? [],
        internal_at: new Date(Number(detail.internalDate)).toISOString(),
        snippet: detail.snippet ?? null,
        deleted_at: null,
        payload_hash: await sha256(JSON.stringify(detail)),
      }, { onConflict: "connection_id,gmail_message_id" });
      if (stored.error) throw new GoogleSyncError("persistence_failed");
      count += 1;
      gmailPersisted = count;
    }
    if (deletedMessageIds.size) {
      const deleted = await database.from("google_messages").update({
        deleted_at: currentTime.toISOString(),
      }).eq("connection_id", connection.id).in(
        "gmail_message_id",
        [...deletedMessageIds],
      );
      if (deleted.error) throw new GoogleSyncError("persistence_failed");
      count += deletedMessageIds.size;
      gmailPersisted = count;
    }
    // Cursor is the provider-issued Gmail history id, never a local timestamp.
    gmailProviderComplete = true;
    await writeCursor(
      database,
      connection,
      "gmail",
      "INBOX",
      providerHistoryId,
    );
    await setFreshness(
      database,
      connection.user_id,
      "google_gmail",
      "fresh",
      null,
      {
        operation: "google_sync",
        provider_status: profileResponse.status,
        persisted_count: count,
        cursor_type: "gmail_history_id",
      },
      currentTime,
    );
    gmail = { state: "fresh", count };
  } catch (error) {
    gmail = failedDataset(
      error instanceof GoogleSyncError
        ? error.safeCode
        : "provider_request_failed",
    );
    await setFreshness(
      database,
      connection.user_id,
      "google_gmail",
      "error",
      gmail.reason ?? "sync_failed",
      {
        operation: "google_sync",
        provider_request_completed: gmailProviderComplete,
        persisted_count: gmailPersisted,
        persistence_complete: false,
      },
      currentTime,
    ).catch(() => undefined);
  }

  // Calendar list, every calendar event request, and event persistence form one
  // verified dataset. A failed calendar is never silently counted as healthy.
  try {
    const configuredCalendars = selectedIds(
      connection.configuration,
      "selected_calendar_ids",
    );
    const calendars: CalendarListItem[] = [];
    let calendarPageToken: string | undefined;
    let calendarPageCount = 0;
    let calendarStatus = 200;
    do {
      const params = new URLSearchParams({ maxResults: "250" });
      if (calendarPageToken) params.set("pageToken", calendarPageToken);
      const listResponse = await fetchImpl(
        `https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`,
        { headers },
      );
      const list = await readJson(listResponse) as
        | { items?: CalendarListItem[]; nextPageToken?: string }
        | null;
      calendarStatus = listResponse.status;
      if (!listResponse.ok || !list) {
        throw new GoogleSyncError("provider_request_failed");
      }
      calendars.push(...(list.items ?? []));
      calendarPageToken = list.nextPageToken;
      calendarPageCount += 1;
      if (calendarPageCount > MAX_PROVIDER_PAGES) {
        throw new GoogleSyncError("provider_page_limit");
      }
    } while (calendarPageToken);
    let count = 0;
    for (const calendarItem of calendars) {
      if (!calendarItem.id) continue;
      if (
        configuredCalendars.enabled &&
        !configuredCalendars.ids.has(calendarItem.id)
      ) continue;
      const previousCursor = await readCursor(
        database,
        connection.id,
        "calendar",
        calendarItem.id,
      );
      let syncToken = previousCursor;
      let eventPageToken: string | undefined;
      let nextSyncToken: string | undefined;
      let retriedInvalidToken = false;
      let eventPageCount = 0;
      while (true) {
        const params = new URLSearchParams({
          singleEvents: "true",
          showDeleted: "true",
          maxResults: "250",
        });
        if (eventPageToken) params.set("pageToken", eventPageToken);
        if (syncToken) params.set("syncToken", syncToken);
        else params.set("timeMin", currentTime.toISOString());
        const response = await fetchImpl(
          `https://www.googleapis.com/calendar/v3/calendars/${
            encodeURIComponent(calendarItem.id)
          }/events?${params}`,
          { headers },
        );
        const payload = await readJson(response) as CalendarPage | null;
        if (!response.ok || !payload) {
          if (response.status === 410 && syncToken && !retriedInvalidToken) {
            syncToken = null;
            eventPageToken = undefined;
            retriedInvalidToken = true;
            continue;
          }
          throw new GoogleSyncError("provider_request_failed");
        }
        for (const item of payload.items ?? []) {
          if (!item.id) continue;
          if (item.status === "cancelled") {
            const removed = await database.from("calendar_events").update({
              status: "cancelled",
              last_modified_at: item.updated ?? currentTime.toISOString(),
              payload_hash: await sha256(JSON.stringify(item)),
            }).eq("user_id", connection.user_id).eq(
              "connection_id",
              connection.id,
            )
              .eq("source", "google").eq(
                "calendar_external_id",
                calendarItem.id,
              )
              .eq("external_id", item.id);
            if (removed.error) throw new GoogleSyncError("persistence_failed");
            count += 1;
            calendarPersisted = count;
            continue;
          }
          if (!item.start?.dateTime || !item.end?.dateTime) continue;
          const stored = await database.from("calendar_events").upsert({
            user_id: connection.user_id,
            connection_id: connection.id,
            source: "google",
            calendar_external_id: calendarItem.id,
            external_id: item.id,
            title: item.summary ?? "Untitled event",
            starts_at: item.start.dateTime,
            ends_at: item.end.dateTime,
            source_timezone: calendarItem.timeZone ?? "Europe/London",
            recurrence_rule: item.recurrence?.[0] ?? null,
            status: item.status ?? "confirmed",
            last_modified_at: item.updated ?? currentTime.toISOString(),
            payload_hash: await sha256(JSON.stringify(item)),
          }, { onConflict: "user_id,source,calendar_external_id,external_id" });
          if (stored.error) throw new GoogleSyncError("persistence_failed");
          count += 1;
          calendarPersisted = count;
        }
        nextSyncToken = payload.nextSyncToken ?? nextSyncToken;
        eventPageToken = payload.nextPageToken;
        eventPageCount += 1;
        if (eventPageCount > MAX_PROVIDER_PAGES) {
          throw new GoogleSyncError("provider_page_limit");
        }
        if (!eventPageToken) break;
      }
      if (!nextSyncToken) throw new GoogleSyncError("provider_cursor_missing");
      await writeCursor(
        database,
        connection,
        "calendar",
        calendarItem.id,
        nextSyncToken,
      );
      calendarProviderComplete = true;
    }
    // Calendar cursors are written per calendar after all event rows persist.
    await setFreshness(
      database,
      connection.user_id,
      "google_calendar",
      "fresh",
      null,
      {
        operation: "google_sync",
        provider_status: calendarStatus,
        persisted_count: count,
        cursor_type: "calendar_sync_token",
      },
      currentTime,
    );
    calendar = { state: "fresh", count };
  } catch (error) {
    calendar = failedDataset(
      error instanceof GoogleSyncError
        ? error.safeCode
        : "provider_request_failed",
    );
    await setFreshness(
      database,
      connection.user_id,
      "google_calendar",
      "error",
      calendar.reason ?? "sync_failed",
      {
        operation: "google_sync",
        provider_request_completed: calendarProviderComplete,
        persisted_count: calendarPersisted,
        persistence_complete: false,
      },
      currentTime,
    ).catch(() => undefined);
  }

  try {
    const configuredFiles = selectedIds(
      connection.configuration,
      "selected_drive_file_ids",
    );
    const previousCursor = await readCursor(
      database,
      connection.id,
      "drive",
      "selected",
    );
    let driveCursor = previousCursor;
    let driveStatus = 200;
    let count = 0;
    const persistFiles = async (
      files: Array<DriveFile & { trashed?: boolean }>,
    ) => {
      for (const file of files) {
        if (!file.id) continue;
        const selected = !configuredFiles.enabled ||
          configuredFiles.ids.has(file.id);
        if (configuredFiles.enabled && !selected) continue;
        if (!file.name || !file.mimeType) continue;
        const stored = await database.from("google_drive_files").upsert({
          user_id: connection.user_id,
          connection_id: connection.id,
          drive_file_id: file.id,
          name: file.name,
          mime_type: file.mimeType,
          modified_at: file.modifiedTime ?? null,
          checksum: file.md5Checksum ?? null,
          selected,
          deleted_at: file.trashed ? currentTime.toISOString() : null,
        }, { onConflict: "connection_id,drive_file_id" });
        if (stored.error) throw new GoogleSyncError("persistence_failed");
        if (selected && !file.trashed) {
          count += 1;
          drivePersisted = count;
        }
      }
    };
    const markRemoved = async (fileId: string) => {
      const removed = await database.from("google_drive_files").update({
        deleted_at: currentTime.toISOString(),
        selected: false,
      }).eq("connection_id", connection.id).eq("drive_file_id", fileId);
      if (removed.error) throw new GoogleSyncError("persistence_failed");
      count += 1;
      drivePersisted = count;
    };
    if (!previousCursor) {
      const tokenResponse = await fetchImpl(
        "https://www.googleapis.com/drive/v3/changes/startPageToken",
        { headers },
      );
      const tokenPayload = await readJson(tokenResponse) as {
        startPageToken?: string;
      } | null;
      driveStatus = tokenResponse.status;
      if (!tokenResponse.ok || !tokenPayload?.startPageToken) {
        throw new GoogleSyncError("provider_request_failed");
      }
      const files: DriveFile[] = [];
      let pageToken: string | undefined;
      let pageCount = 0;
      do {
        const params = new URLSearchParams({
          pageSize: "100",
          fields:
            "files(id,name,mimeType,modifiedTime,md5Checksum,trashed),nextPageToken",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const response = await fetchImpl(
          `https://www.googleapis.com/drive/v3/files?${params}`,
          { headers },
        );
        const payload = await readJson(response) as DrivePage | null;
        driveStatus = response.status;
        if (!response.ok || !payload) {
          throw new GoogleSyncError("provider_request_failed");
        }
        files.push(...(payload.files ?? []));
        pageToken = payload.nextPageToken;
        pageCount += 1;
        if (pageCount > MAX_PROVIDER_PAGES) {
          throw new GoogleSyncError("provider_page_limit");
        }
      } while (pageToken);
      await persistFiles(files);
      driveCursor = tokenPayload.startPageToken;
    }
    let changesPageToken = driveCursor ?? "";
    let changesPageCount = 0;
    let nextStartPageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        pageToken: changesPageToken,
        pageSize: "100",
        includeRemoved: "true",
        fields:
          "changes(file(id,name,mimeType,modifiedTime,md5Checksum,trashed),fileId,removed),nextPageToken,newStartPageToken",
      });
      const response = await fetchImpl(
        `https://www.googleapis.com/drive/v3/changes?${params}`,
        { headers },
      );
      const payload = await readJson(response) as DrivePage | null;
      driveStatus = response.status;
      if (!response.ok || !payload) {
        throw new GoogleSyncError("provider_request_failed");
      }
      for (const change of payload.changes ?? []) {
        if (change.removed || !change.file) {
          if (change.fileId) await markRemoved(change.fileId);
        } else {
          await persistFiles([change.file]);
        }
      }
      changesPageToken = payload.nextPageToken ?? "";
      nextStartPageToken = payload.newStartPageToken ?? nextStartPageToken;
      changesPageCount += 1;
      if (changesPageCount > MAX_PROVIDER_PAGES) {
        throw new GoogleSyncError("provider_page_limit");
      }
    } while (changesPageToken);
    driveCursor = nextStartPageToken ?? driveCursor;
    if (!driveCursor) throw new GoogleSyncError("provider_cursor_missing");
    driveProviderComplete = true;
    await writeCursor(
      database,
      connection,
      "drive",
      "selected",
      driveCursor,
    );
    await setFreshness(
      database,
      connection.user_id,
      "google_drive",
      "fresh",
      null,
      {
        operation: "google_sync",
        provider_status: driveStatus,
        persisted_count: count,
        cursor_type: "drive_change_page_token",
      },
      currentTime,
    );
    drive = { state: "fresh", count };
  } catch (error) {
    drive = failedDataset(
      error instanceof GoogleSyncError
        ? error.safeCode
        : "provider_request_failed",
    );
    await setFreshness(
      database,
      connection.user_id,
      "google_drive",
      "error",
      drive.reason ?? "sync_failed",
      {
        operation: "google_sync",
        provider_request_completed: driveProviderComplete,
        persisted_count: drivePersisted,
        persistence_complete: false,
      },
      currentTime,
    ).catch(() => undefined);
  }

  return {
    connection_id: connection.id,
    user_id: connection.user_id,
    ok: gmail.state === "fresh" && calendar.state === "fresh" &&
      drive.state === "fresh",
    datasets: { gmail, calendar, drive },
  };
}

export function isGoogleSyncError(error: unknown): error is GoogleSyncError {
  return error instanceof GoogleSyncError;
}

export type GoogleRevokeResult = {
  connection_id: string;
  provider_revoked: boolean;
  credential_deleted: boolean;
  status: "revoked" | "partially_revoked";
  action_required: "none" | "reauthorize_or_revoke_at_google";
};

export async function revokeGoogleConnection(
  database: SupabaseClient,
  connectionId: string,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleRevokeResult> {
  const connection = await database.from("connections").select(
    "id,user_id,provider",
  ).eq("id", connectionId).eq("user_id", userId).eq("provider", "google")
    .maybeSingle().returns<{ id: string; user_id: string; provider: string }>();
  if (connection.error || !connection.data) {
    throw new GoogleSyncError("connection_unavailable");
  }
  const credential = await database.from("connection_credentials").select(
    "encrypted_refresh_token",
  ).eq("connection_id", connectionId).maybeSingle().returns<CredentialRow>();
  let providerRevoked = false;
  if (credential.data?.encrypted_refresh_token) {
    try {
      const refreshToken = await decryptRefreshToken(
        credential.data.encrypted_refresh_token,
      );
      const response = await fetchImpl("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      });
      providerRevoked = response.ok;
    } catch {
      providerRevoked = false;
    }
  }
  const disabled = await database.from("connections").update({
    status: "revoked",
    sync_enabled: false,
  }).eq("id", connectionId).eq("user_id", userId).select("id").maybeSingle();
  if (disabled.error || !disabled.data) {
    throw new GoogleSyncError("connection_disable_failed");
  }
  const deleted = await database.from("connection_credentials").delete()
    .eq("connection_id", connectionId).select("connection_id").maybeSingle();
  if (deleted.error) throw new GoogleSyncError("credential_delete_failed");
  for (
    const dataset of [
      "google_gmail",
      "google_calendar",
      "google_drive",
    ] as const
  ) {
    await setFreshness(
      database,
      userId,
      dataset,
      "not_connected",
      "connection_revoked",
      { operation: "google_revoke", provider_revoked: providerRevoked },
      new Date(),
    ).catch(() => undefined);
  }
  return {
    connection_id: connectionId,
    provider_revoked: providerRevoked,
    credential_deleted: true,
    status: providerRevoked ? "revoked" : "partially_revoked",
    action_required: providerRevoked
      ? "none"
      : "reauthorize_or_revoke_at_google",
  };
}
