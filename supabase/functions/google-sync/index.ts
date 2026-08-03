import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const decode = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function decrypt(payload: string): Promise<string> {
  const raw = Deno.env.get("APP_TOKEN_ENCRYPTION_KEY");
  const [nonce, ciphertext] = payload.split(".");
  if (!raw || !nonce || !ciphertext) {
    throw new Error("credential_decryption_unavailable");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    decode(raw),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(nonce) },
      key,
      decode(ciphertext),
    ),
  );
}
async function accessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("google_oauth_not_configured");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const value = await response.json() as { access_token?: string };
  if (!response.ok || !value.access_token) {
    throw new Error("google_token_refresh_failed");
  }
  return value.access_token;
}

Deno.serve(async (request) => {
  if (
    request.method !== "POST" ||
    request.headers.get("x-google-sync-secret") !==
      Deno.env.get("GOOGLE_SYNC_SECRET")
  ) return json({ code: "unauthorised" }, 401);
  const body = await request.json().catch(() => null) as {
    connectionId?: string;
  } | null;
  if (!body?.connectionId) return json({ code: "connection_required" }, 400);
  const connection = await service.from("connections").select(
    "id,user_id,status",
  ).eq("id", body.connectionId).eq("provider", "google").maybeSingle();
  if (
    connection.error || !connection.data ||
    connection.data.status !== "connected"
  ) return json({ code: "connection_unavailable" }, 404);
  const credential = await service.from("connection_credentials").select(
    "encrypted_refresh_token",
  ).eq("connection_id", connection.data.id).maybeSingle();
  if (credential.error || !credential.data) {
    return json({ code: "credential_unavailable" }, 422);
  }
  let token: string;
  try {
    token = await accessToken(
      await decrypt(credential.data.encrypted_refresh_token),
    );
  } catch {
    await service.from("connections").update({
      status: "reauthentication_required",
    }).eq("id", connection.data.id);
    return json({ code: "token_refresh_failed" }, 401);
  }
  const headers = { authorization: `Bearer ${token}` };
  const [calendarResponse, driveResponse] = await Promise.all([
    fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers,
    }),
    fetch(
      "https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,mimeType,modifiedTime,md5Checksum)",
      { headers },
    ),
  ]);
  const calendars = await calendarResponse.json() as {
    items?: Array<{ id: string; summary?: string; timeZone?: string }>;
  };
  const drive = await driveResponse.json() as {
    files?: Array<
      {
        id: string;
        name?: string;
        mimeType?: string;
        modifiedTime?: string;
        md5Checksum?: string;
      }
    >;
  };
  if (!calendarResponse.ok || !driveResponse.ok) {
    return json({ code: "google_sync_failed" }, 502);
  }
  const gmailResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&labelIds=INBOX",
    { headers },
  );
  const gmail = await gmailResponse.json() as {
    messages?: Array<{ id: string; threadId: string }>;
  };
  if (!gmailResponse.ok) return json({ code: "gmail_sync_failed" }, 502);
  let events = 0;
  for (const calendar of calendars.items ?? []) {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${
        encodeURIComponent(calendar.id)
      }/events?singleEvents=true&timeMin=${
        encodeURIComponent(new Date().toISOString())
      }&maxResults=250`,
      { headers },
    );
    const payload = await response.json() as {
      items?: Array<
        {
          id: string;
          summary?: string;
          start?: { dateTime?: string };
          end?: { dateTime?: string };
          updated?: string;
          status?: string;
          recurrence?: string[];
        }
      >;
    };
    if (!response.ok) continue;
    const rows = (payload.items ?? []).filter((item) =>
      item.id && item.start?.dateTime && item.end?.dateTime
    ).map((item) => ({
      user_id: connection.data.user_id,
      connection_id: connection.data.id,
      source: "google",
      calendar_external_id: calendar.id,
      external_id: item.id,
      title: item.summary ?? "Untitled event",
      starts_at: item.start!.dateTime!,
      ends_at: item.end!.dateTime!,
      source_timezone: calendar.timeZone ?? "Europe/London",
      recurrence_rule: item.recurrence?.[0] ?? null,
      status: item.status ?? "confirmed",
      last_modified_at: item.updated ?? new Date().toISOString(),
      payload_hash: item.id,
    }));
    if (rows.length) {
      const result = await service.from("calendar_events").upsert(rows, {
        onConflict: "user_id,source,calendar_external_id,external_id",
      });
      if (result.error) return json({ code: "calendar_store_failed" }, 500);
      events += rows.length;
    }
  }
  const driveRows = (drive.files ?? []).filter((file) =>
    file.id && file.name && file.mimeType
  ).map((file) => ({
    user_id: connection.data.user_id,
    connection_id: connection.data.id,
    drive_file_id: file.id,
    name: file.name!,
    mime_type: file.mimeType!,
    modified_at: file.modifiedTime ?? null,
    checksum: file.md5Checksum ?? null,
    selected: true,
  }));
  if (driveRows.length) {
    const stored = await service.from("google_drive_files").upsert(driveRows, {
      onConflict: "connection_id,drive_file_id",
    });
    if (stored.error) return json({ code: "drive_store_failed" }, 500);
  }
  let messages = 0;
  for (const message of gmail.messages ?? []) {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${
        encodeURIComponent(message.id)
      }?format=metadata`,
      { headers },
    );
    const item = await response.json() as {
      id?: string;
      threadId?: string;
      labelIds?: string[];
      internalDate?: string;
      snippet?: string;
    };
    if (!response.ok || !item.id || !item.threadId || !item.internalDate) {
      continue;
    }
    const stored = await service.from("google_messages").upsert({
      user_id: connection.data.user_id,
      connection_id: connection.data.id,
      gmail_message_id: item.id,
      thread_id: item.threadId,
      label_ids: item.labelIds ?? [],
      internal_at: new Date(Number(item.internalDate)).toISOString(),
      snippet: item.snippet ?? null,
      payload_hash: await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(item)),
      )
        .then((value) =>
          Array.from(
            new Uint8Array(value),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join("")
        ),
    }, { onConflict: "connection_id,gmail_message_id" });
    if (stored.error) return json({ code: "gmail_store_failed" }, 500);
    messages += 1;
  }
  await service.from("integration_cursors").upsert({
    user_id: connection.data.user_id,
    connection_id: connection.data.id,
    resource_type: "drive",
    resource_id: "selected",
    cursor: new Date().toISOString(),
  }, { onConflict: "connection_id,resource_type,resource_id" });
  await service.from("integration_cursors").upsert({
    user_id: connection.data.user_id,
    connection_id: connection.data.id,
    resource_type: "gmail",
    resource_id: "INBOX",
    cursor: new Date().toISOString(),
  }, { onConflict: "connection_id,resource_type,resource_id" });
  await service.from("data_freshness").upsert({
    user_id: connection.data.user_id,
    source: "google",
    last_source_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    expected_cadence: "24 hours",
    state: "fresh",
  }, { onConflict: "user_id,source" });
  return json({
    calendars: calendars.items?.length ?? 0,
    events,
    messages,
    driveFiles: drive.files?.length ?? 0,
  });
});
