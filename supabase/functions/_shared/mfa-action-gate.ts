import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

export async function consumeMfaActionGate(
  gateId: string | undefined,
  accessToken: string,
  actionKey:
    | "apple_bridge_create"
    | "apple_bridge_revoke"
    | "gmail_test_notification"
    | "connection_revoke"
    | "connection_scope_change",
): Promise<boolean> {
  if (
    !gateId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(gateId)
  ) {
    return false;
  }
  const caller = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
  const { data, error } = await caller.rpc("consume_mfa_action_gate", {
    p_gate_id: gateId,
    p_action_key: actionKey,
  });
  return !error && data === true;
}
