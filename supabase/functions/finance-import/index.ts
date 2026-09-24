import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  deriveFinanceClose,
  minorUnitsToString,
  parseFinanceCsv,
} from "../_shared/finance-contract.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const allowedEmail = "matthewirving99@gmail.com";
const route = "/functions/v1/finance-import";

const json = (body: unknown, status = 200, requestId?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });

function failure(
  requestId: string,
  code: string,
  status: number,
  stage: string,
  detail: string,
  remediation: string,
) {
  return json(
    {
      code,
      requestId,
      diagnostic: {
        code,
        stage,
        httpStatus: status,
        requestId,
        route,
        method: "POST",
        detail,
        remediation,
      },
    },
    status,
    requestId,
  );
}

const sha256 = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function isSafeText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  );
}

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return failure(
      requestId,
      "method_not_allowed",
      405,
      "request.method",
      "Finance import accepts POST requests only.",
      "Submit the controlled statement through the Finance page.",
    );
  }
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return failure(
      requestId,
      "unauthorised",
      401,
      "authentication.header",
      "No bearer session was supplied to the finance import control plane.",
      "Sign in again, complete MFA, and retry the import.",
    );
  }
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authorization } },
  });
  const { data: identity, error: identityError } = await caller.auth.getUser();
  if (identityError || !identity.user) {
    return failure(
      requestId,
      "authenticated_session_required",
      401,
      "authentication.user_lookup",
      "Supabase could not validate the authenticated finance operator.",
      "Sign in again, complete MFA, and retry the import.",
    );
  }
  if (identity.user.email?.toLowerCase() !== allowedEmail) {
    return failure(
      requestId,
      "authenticated_session_required",
      403,
      "authorization.allowlist",
      "The authenticated account is not the approved finance operator.",
      "Use the allowlisted production account and do not retry with another account.",
    );
  }
  // The one-time, user-bound gate is the elevation proof for this request.
  // Do not re-check the JWT's current AAL here: an inline MFA response can
  // legitimately arrive while the browser still presents the pre-challenge
  // AAL1 session cookie. The gate was created only after AAL2 verification and
  // is consumed exactly once below, matching the Digital Estate flow.
  const payload = (await request.json().catch(() => null)) as {
    accountId?: unknown;
    currency?: unknown;
    statementName?: unknown;
    csv?: unknown;
    openingBalance?: unknown;
    closingBalance?: unknown;
    mfaGateId?: unknown;
  } | null;
  if (
    !payload ||
    !isUuid(payload.accountId) ||
    typeof payload.currency !== "string" ||
    !/^[A-Z]{3}$/.test(payload.currency) ||
    !isSafeText(payload.statementName, 200) ||
    typeof payload.csv !== "string" ||
    payload.csv.length === 0 ||
    payload.csv.length > 1_000_000 ||
    (payload.openingBalance !== undefined &&
      typeof payload.openingBalance !== "string") ||
    (payload.closingBalance !== undefined &&
      typeof payload.closingBalance !== "string") ||
    typeof payload.mfaGateId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(
        payload.mfaGateId,
      )
  ) {
    return failure(
      requestId,
      "invalid_finance_import",
      400,
      "request.validation",
      "The import requires an account ID, three-letter currency, statement name, and CSV under 1 MB.",
      "Use the provided four-column CSV template and do not enter provider credentials.",
    );
  }
  const parsed = parseFinanceCsv(payload.csv);
  if (!("rows" in parsed)) {
    return failure(
      requestId,
      parsed.code,
      422,
      "request.statement_parse",
      parsed.detail,
      "Correct the statement format and submit it again; no archive or database write occurred.",
    );
  }
  const account = await service
    .from("finance_accounts")
    .select("id,currency,active")
    .eq("id", payload.accountId)
    .eq("user_id", identity.user.id)
    .maybeSingle();
  if (account.error) {
    return failure(
      requestId,
      "finance_account_lookup_failed",
      500,
      "persistence.account_lookup",
      `The mapped finance account could not be loaded (${
        account.error.code ?? "database_error"
      }).`,
      "Retry once; if it repeats, provide the request ID. No statement was archived.",
    );
  }
  if (!account.data) {
    return failure(
      requestId,
      "finance_account_not_found",
      404,
      "persistence.account_lookup",
      "The selected finance account does not belong to the signed-in operator or is unavailable.",
      "Configure the account on the Finance page, then retry the import.",
    );
  }
  if (!account.data.active || account.data.currency !== payload.currency) {
    return failure(
      requestId,
      "finance_account_currency_mismatch",
      422,
      "request.account_consistency",
      `The selected account is inactive or uses ${account.data.currency}, not ${payload.currency}.`,
      "Choose the matching mapped account and statement currency.",
    );
  }
  const { data: gateConsumed, error: gateError } = await caller.rpc(
    "consume_mfa_action_gate",
    {
      p_gate_id: payload.mfaGateId,
      p_action_key: "finance_import",
    },
  );
  if (gateError || gateConsumed !== true) {
    return failure(
      requestId,
      "fresh_mfa_required",
      403,
      "mfa_gate.consume",
      gateError
        ? "The one-time Finance import MFA gate could not be validated by the database boundary."
        : "The one-time Finance import MFA gate was missing, expired, replayed, or bound to another user.",
      "Start the import again and complete a fresh Microsoft Authenticator challenge.",
    );
  }
  const digest = await sha256(payload.csv);
  const duplicate = await service
    .from("finance_statements")
    .select("id,status")
    .eq("user_id", identity.user.id)
    .eq("sha256", digest)
    .maybeSingle();
  if (duplicate.error) {
    return failure(
      requestId,
      "finance_duplicate_check_failed",
      500,
      "persistence.statement_duplicate_check",
      `The statement deduplication check failed (${
        duplicate.error.code ?? "database_error"
      }).`,
      "Retry once; the statement was not archived.",
    );
  }
  if (duplicate.data) {
    return json(
      {
        code: "finance_statement_replay",
        requestId,
        imported: false,
        replay: true,
        statementId: duplicate.data.id,
        status: duplicate.data.status,
        diagnostic: {
          code: "finance_statement_replay",
          stage: "persistence.statement_duplicate_check",
          httpStatus: 200,
          requestId,
          route,
          method: "POST",
          detail:
            "The exact statement content was already imported; no duplicate statement or transactions were created.",
          remediation:
            "Review the existing Finance close state; do not upload the same statement again.",
        },
      },
      200,
      requestId,
    );
  }
  const archiveUrl = Deno.env.get("FINANCE_ARCHIVE_GATEWAY_URL");
  const archiveSecret = Deno.env.get("FINANCE_ARCHIVE_GATEWAY_SECRET");
  if (!archiveUrl || !archiveSecret) {
    return failure(
      requestId,
      "archive_unconfigured",
      503,
      "archive.configuration",
      "The private finance archive gateway is not configured in the Edge Function environment.",
      "Configure the production finance archive gateway before importing sensitive statements.",
    );
  }
  let archiveResponse: Response;
  try {
    archiveResponse = await fetch(archiveUrl, {
      method: "POST",
      headers: {
        "content-type": "text/csv",
        "x-archive-secret": archiveSecret,
        "x-content-sha256": digest,
        "x-file-name": payload.statementName,
        "x-user-id": identity.user.id,
      },
      body: payload.csv,
    });
  } catch {
    return failure(
      requestId,
      "archive_gateway_unreachable",
      502,
      "archive.gateway_request",
      "The private finance archive gateway could not be reached; the statement was not persisted.",
      "Retry once; if it repeats, provide the request ID and keep the statement locally.",
    );
  }
  const archive = (await archiveResponse.json().catch(() => null)) as {
    key?: unknown;
    bytes?: unknown;
  } | null;
  if (
    !archiveResponse.ok ||
    !isSafeText(archive?.key, 500) ||
    typeof archive?.bytes !== "number" ||
    archive.bytes < 1
  ) {
    return failure(
      requestId,
      "archive_failed",
      502,
      "archive.gateway_response",
      `The private archive gateway returned an invalid response (HTTP ${archiveResponse.status}); no database statement was created.`,
      "Retry once; if it repeats, provide the request ID for archive-gateway investigation.",
    );
  }
  const object = await service
    .from("source_objects")
    .insert({
      user_id: identity.user.id,
      r2_key: archive.key,
      sha256: digest,
      size_bytes: archive.bytes,
      mime_type: "text/csv",
      data_classification: "highly_sensitive",
      source: "finance_upload",
      captured_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (object.error || !object.data) {
    return failure(
      requestId,
      "archive_metadata_failed",
      500,
      "persistence.archive_object_index",
      `The archive object was written but its database index could not be recorded (${
        object.error?.code ?? "database_error"
      }).`,
      "Do not retry blindly; provide the request ID so the archive/object boundary can be reconciled.",
    );
  }
  const statement = await service
    .from("finance_statements")
    .insert({
      user_id: identity.user.id,
      account_id: payload.accountId,
      source: "upload",
      source_object_id: object.data.id,
      sha256: digest,
      mime_type: "text/csv",
      period_start: parsed.rows[0]?.transactionDate,
      period_end: parsed.rows.at(-1)?.transactionDate,
      opening_balance: payload.openingBalance ?? null,
      closing_balance: payload.closingBalance ?? null,
      currency: payload.currency,
      status: "archived",
    })
    .select("id")
    .single();
  if (statement.error || !statement.data) {
    return failure(
      requestId,
      "statement_create_failed",
      500,
      "persistence.statement_insert",
      `The archived statement could not be indexed (${
        statement.error?.code ?? "database_error"
      }).`,
      "Do not retry blindly; provide the request ID so the archive/object boundary can be reconciled.",
    );
  }
  const transactions = await Promise.all(
    parsed.rows.map(async (row) => ({
      user_id: identity.user!.id,
      account_id: payload.accountId!,
      statement_id: statement.data!.id,
      external_id: row.externalId,
      transaction_date: row.transactionDate,
      description: row.description,
      amount: row.amount,
      currency: payload.currency as string,
      transaction_hash: await sha256(
        [
          row.externalId,
          row.transactionDate,
          row.description,
          row.amount,
          payload.currency,
        ].join(
          "\u0000",
        ),
      ),
      provenance: { source: "statement_csv", request_id: requestId },
    })),
  );
  const stored = await service
    .from("finance_transactions")
    .upsert(transactions, { onConflict: "account_id,transaction_hash" });
  if (stored.error) {
    return failure(
      requestId,
      "transaction_store_failed",
      500,
      "persistence.transaction_upsert",
      `The statement was archived but transactions could not be stored (${
        stored.error.code ?? "database_error"
      }).`,
      "Do not retry blindly; provide the request ID so the archived statement can be reconciled.",
    );
  }
  const close = deriveFinanceClose(
    parsed.rows,
    payload.openingBalance,
    payload.closingBalance,
  );
  const closeResult = await service
    .from("finance_close_periods")
    .upsert(
      {
        user_id: identity.user.id,
        period_start: close.periodStart,
        period_end: close.periodEnd,
        close_kind: close.closeKind,
        readiness: close.readiness,
        blockers: close.blockers,
        reconciled: close.reconciled,
      },
      { onConflict: "user_id,period_start,period_end,close_kind" },
    )
    .select("id")
    .single();
  if (closeResult.error || !closeResult.data) {
    return failure(
      requestId,
      "close_readiness_persistence_failed",
      500,
      "persistence.close_upsert",
      `Transactions were stored but close readiness could not be recorded (${
        closeResult.error?.code ?? "database_error"
      }).`,
      "Do not retry blindly; provide the request ID so the transaction and close evidence can be reconciled.",
    );
  }
  const statementUpdate = await service
    .from("finance_statements")
    .update({
      status: "parsed",
      period_start: close.periodStart,
      period_end: close.periodEnd,
    })
    .eq("id", statement.data.id);
  if (statementUpdate.error) {
    return failure(
      requestId,
      "statement_status_update_failed",
      500,
      "persistence.statement_status_update",
      `Transactions and close readiness were recorded but statement status could not be updated (${
        statementUpdate.error.code ?? "database_error"
      }).`,
      "Do not retry blindly; provide the request ID for reconciliation.",
    );
  }
  await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "finance_statement_imported",
    target_type: "finance_statement",
    target_id: statement.data.id,
    aal: "aal2",
    result: "success",
    redacted_after: {
      transaction_count: transactions.length,
      currency: payload.currency,
      close_readiness: close.readiness,
      reconciled: close.reconciled,
      close_period_id: closeResult.data.id,
    },
  });
  return json(
    {
      code: "finance_import_complete",
      requestId,
      imported: true,
      replay: false,
      statementId: statement.data.id,
      transactionCount: transactions.length,
      currency: payload.currency,
      close: {
        id: closeResult.data.id,
        periodStart: close.periodStart,
        periodEnd: close.periodEnd,
        readiness: close.readiness,
        reconciled: close.reconciled,
        blockers: close.blockers,
        calculatedClosingBalance: close.calculatedClosingMinor === null
          ? null
          : minorUnitsToString(close.calculatedClosingMinor),
      },
    },
    201,
    requestId,
  );
});
