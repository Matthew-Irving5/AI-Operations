import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { normalizeCategoryNames } from "../_shared/finance-contract.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const allowedEmail = "matthewirving99@gmail.com";

type Diagnostic = {
  code: string;
  stage: string;
  httpStatus: number;
  requestId: string;
  detail: string;
  remediation: string;
};

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
  const diagnostic: Diagnostic = {
    code,
    stage,
    httpStatus: status,
    requestId,
    detail,
    remediation,
  };
  return json({ code, requestId, diagnostic }, status, requestId);
}

function isSafeText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maxLength &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
}

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return failure(
      requestId,
      "method_not_allowed",
      405,
      "request.method",
      "Finance control accepts POST requests only.",
      "Submit the finance configuration form again without changing the browser URL.",
    );
  }
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return failure(
      requestId,
      "unauthorised",
      401,
      "authentication.header",
      "No bearer session was supplied to the finance control plane.",
      "Sign in again, complete MFA, and retry the finance configuration.",
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
      "Sign in again, complete MFA, and retry the finance configuration.",
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
  const body = await request.json().catch(() => null) as
    | Record<string, unknown>
    | null;
  const mfaGateId = body?.mfaGateId;
  if (
    typeof mfaGateId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(mfaGateId)
  ) {
    return failure(
      requestId,
      "mfa_handoff_missing",
      400,
      "mfa_gate.validation",
      "The finance mapping resumed without the UUID of its one-time MFA gate.",
      "Start the mapping again from Finance and complete the in-page MFA challenge.",
    );
  }
  const account = body?.account as Record<string, unknown> | undefined;
  const source = body?.source as Record<string, unknown> | undefined;
  const categoryValues = Array.isArray(body?.categories)
    ? body.categories.filter((value): value is string =>
      typeof value === "string"
    )
    : [];
  const categories = normalizeCategoryNames(categoryValues);
  if (
    !account || !isSafeText(account.institutionName, 120) ||
    !isSafeText(account.accountLabel, 120) ||
    !["bank", "credit", "cash", "savings", "investment", "other"].includes(
      String(account.accountType),
    ) || typeof account.currency !== "string" ||
    !/^[A-Z]{3}$/.test(account.currency) || categories.length === 0 ||
    categories.length > 100
  ) {
    return failure(
      requestId,
      "invalid_finance_configuration",
      400,
      "request.validation",
      "The configuration requires an institution, account label, supported account type, three-letter currency, and at least one category.",
      "Correct the highlighted account and category fields; do not enter provider credentials.",
    );
  }
  const sourceKind = source?.kind;
  const spreadsheetId = source?.spreadsheetExternalId;
  if (
    sourceKind !== "upload" && sourceKind !== "google_sheet"
  ) {
    return failure(
      requestId,
      "invalid_finance_source",
      400,
      "request.source_validation",
      "The finance source kind must be upload or google_sheet.",
      "Choose a controlled statement upload or the already-approved read-only Google Sheet.",
    );
  }
  if (sourceKind === "google_sheet" && !isSafeText(spreadsheetId, 256)) {
    return failure(
      requestId,
      "finance_source_id_required",
      400,
      "request.source_validation",
      "A Google Sheet source requires its approved external spreadsheet ID.",
      "Select the approved finance workbook in Data Sources and copy only its file ID.",
    );
  }
  const { data: gateConsumed, error: gateError } = await caller.rpc(
    "consume_mfa_action_gate",
    { p_gate_id: mfaGateId, p_action_key: "finance_configure" },
  );
  if (gateError || gateConsumed !== true) {
    return failure(
      requestId,
      "fresh_mfa_required",
      403,
      "mfa_gate.consume",
      gateError
        ? "The one-time Finance mapping MFA gate could not be validated by the database boundary."
        : "The one-time Finance mapping MFA gate was missing, expired, replayed, or bound to another user.",
      "Start the mapping again and complete a fresh Microsoft Authenticator challenge.",
    );
  }
  const userId = identity.user.id;
  const accountResult = await service.from("finance_accounts").upsert({
    user_id: userId,
    institution_name: account.institutionName.trim(),
    account_label: account.accountLabel.trim(),
    account_type: account.accountType,
    currency: account.currency,
    external_reference: null,
    active: true,
  }, { onConflict: "user_id,institution_name,account_label" }).select("id")
    .single();
  if (accountResult.error || !accountResult.data) {
    return failure(
      requestId,
      "finance_account_persistence_failed",
      500,
      "persistence.account_upsert",
      `The finance account could not be saved (${
        accountResult.error?.code ?? "database_error"
      }).`,
      "Retry once; if it repeats, provide the request ID. No statement was imported.",
    );
  }
  const categoryResult = await service.from("finance_categories").upsert(
    categories.map((name) => ({ user_id: userId, name, active: true })),
    { onConflict: "user_id,name" },
  ).select("id,name");
  if (categoryResult.error) {
    return failure(
      requestId,
      "finance_category_persistence_failed",
      500,
      "persistence.category_upsert",
      `The finance categories could not be saved (${
        categoryResult.error.code ?? "database_error"
      }).`,
      "Retry once; if it repeats, provide the request ID. The account mapping may already exist.",
    );
  }
  let adapterId: string | null = null;
  if (sourceKind === "google_sheet") {
    const adapter = await service.from("finance_sheet_adapters").upsert({
      user_id: userId,
      spreadsheet_external_id: spreadsheetId,
      configuration: {
        account_id: accountResult.data.id,
        configured_category_count: categories.length,
        configured_at: new Date().toISOString(),
      },
      read_only: true,
    }, { onConflict: "user_id,spreadsheet_external_id" }).select("id").single();
    if (adapter.error || !adapter.data) {
      return failure(
        requestId,
        "finance_source_mapping_persistence_failed",
        500,
        "persistence.source_adapter_upsert",
        `The read-only finance source mapping could not be saved (${
          adapter.error?.code ?? "database_error"
        }).`,
        "Retry once; if it repeats, provide the request ID. No provider credentials were changed.",
      );
    }
    adapterId = adapter.data.id;
  }
  await service.from("audit_events").insert({
    user_id: userId,
    actor_type: "user",
    action_type: "finance_mapping_updated",
    target_type: "finance_account",
    target_id: accountResult.data.id,
    aal: "aal2",
    result: "success",
    redacted_after: {
      source_kind: sourceKind,
      category_count: categories.length,
      adapter_configured: Boolean(adapterId),
    },
  });
  return json(
    {
      code: "finance_mapping_saved",
      requestId,
      accountId: accountResult.data.id,
      categoryCount: categories.length,
      sourceKind,
      adapterConfigured: Boolean(adapterId),
      configuredAt: new Date().toISOString(),
    },
    200,
    requestId,
  );
});
