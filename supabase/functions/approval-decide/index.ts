import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return json({ code: "unauthorised" }, 401);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: token } },
  });
  const [{ data: identity }, { data: assurance }] = await Promise.all([
    caller.auth.getUser(),
    caller.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com" ||
    assurance?.currentLevel !== "aal2"
  ) return json({ code: "forbidden" }, 403);
  const body = await request.json() as {
    approvalId?: string;
    decision?: string;
    note?: string;
  };
  if (
    !body.approvalId ||
    (body.decision !== "approved" && body.decision !== "rejected") ||
    (body.note?.length ?? 0) > 500
  ) return json({ code: "invalid_decision" }, 400);
  const { data, error } = await service.rpc("decide_approval", {
    p_user_id: identity.user.id,
    p_approval_id: body.approvalId,
    p_decision: body.decision,
    p_note: body.note?.trim() || null,
  });
  return error
    ? json({ code: "approval_decision_rejected" }, 422)
    : json({ approval: data });
});
