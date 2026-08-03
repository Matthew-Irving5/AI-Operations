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
const sha = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const allowedEmail = "matthewirving99@gmail.com";
const validAmount = (value: string) => /^-?\d+(\.\d{1,2})?$/.test(value);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "unauthorised" }, 401);
  }
  const caller = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );
  const [{ data: identity }, { data: assurance }] = await Promise.all([
    caller.auth.getUser(),
    caller.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (
    !identity.user || identity.user.email?.toLowerCase() !== allowedEmail ||
    assurance?.currentLevel !== "aal2"
  ) return json({ code: "forbidden" }, 403);
  const payload = await request.json().catch(() => null) as {
    accountId?: string;
    currency?: string;
    statementName?: string;
    csv?: string;
    openingBalance?: string;
    closingBalance?: string;
  } | null;
  if (
    !payload?.accountId || !payload.currency ||
    !/^[A-Z]{3}$/.test(payload.currency) || !payload.statementName ||
    !payload.csv || payload.csv.length > 1_000_000
  ) return json({ code: "invalid_payload" }, 400);
  const [header, ...lines] = payload.csv.trim().split(/\r?\n/);
  if (
    header?.trim().toLowerCase() !== "id,date,description,amount" ||
    !lines.length
  ) return json({ code: "unsupported_statement_format" }, 422);
  const parsed = lines.filter(Boolean).map((line) =>
    line.split(",").map((item) => item.trim())
  );
  if (
    parsed.some((row) =>
      row.length !== 4 || !row[0] || !row[1] || !row[2] || !row[3] ||
      Number.isNaN(Date.parse(`${row[1]}T00:00:00Z`)) || !validAmount(row[3])
    )
  ) return json({ code: "statement_parse_failed" }, 422);
  const archiveUrl = Deno.env.get("FINANCE_ARCHIVE_GATEWAY_URL"),
    archiveSecret = Deno.env.get("FINANCE_ARCHIVE_GATEWAY_SECRET");
  if (!archiveUrl || !archiveSecret) {
    return json({ code: "archive_unconfigured" }, 503);
  }
  const digest = await sha(payload.csv);
  const archiveResponse = await fetch(archiveUrl, {
    method: "POST",
    headers: {
      "content-type": "text/csv",
      "x-archive-secret": archiveSecret,
      "x-content-sha256": digest,
      "x-file-name": payload.statementName,
    },
    body: payload.csv,
  });
  const archive = await archiveResponse.json().catch(() => null) as {
    key?: string;
    bytes?: number;
  } | null;
  if (
    !archiveResponse.ok || !archive?.key || typeof archive.bytes !== "number"
  ) return json({ code: "archive_failed" }, 502);
  const object = await service.from("source_objects").insert({
    user_id: identity.user.id,
    r2_key: archive.key,
    sha256: digest,
    size_bytes: archive.bytes,
    mime_type: "text/csv",
    data_classification: "highly_sensitive",
    source: "finance_upload",
    captured_at: new Date().toISOString(),
  }).select("id").single();
  if (object.error || !object.data) {
    return json({ code: "archive_metadata_failed" }, 500);
  }
  const statement = await service.from("finance_statements").insert({
    user_id: identity.user.id,
    account_id: payload.accountId,
    source: "upload",
    source_object_id: object.data.id,
    sha256: digest,
    mime_type: "text/csv",
    currency: payload.currency,
    opening_balance: payload.openingBalance ?? null,
    closing_balance: payload.closingBalance ?? null,
    status: "archived",
  }).select("id").single();
  if (statement.error?.code === "23505") {
    return json({ imported: false, replay: true });
  }
  if (statement.error || !statement.data) {
    return json({ code: "statement_create_failed" }, 500);
  }
  const transactions = await Promise.all(parsed.map(async (row) => ({
    user_id: identity.user!.id,
    account_id: payload.accountId!,
    statement_id: statement.data.id,
    external_id: row[0],
    transaction_date: row[1],
    description: row[2],
    amount: row[3],
    currency: payload.currency!,
    transaction_hash: await sha(
      [row[0], row[1], row[2], row[3], payload.currency].join("\u0000"),
    ),
    provenance: { source: "statement_csv" },
  })));
  const stored = await service.from("finance_transactions").upsert(
    transactions,
    { onConflict: "account_id,transaction_hash" },
  );
  if (stored.error) return json({ code: "transaction_store_failed" }, 500);
  await service.from("finance_statements").update({ status: "parsed" }).eq(
    "id",
    statement.data.id,
  );
  return json({
    imported: true,
    statementId: statement.data.id,
    transactions: transactions.length,
  }, 201);
});
