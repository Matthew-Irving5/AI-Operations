import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

export async function consumeMfaActionGate(
  gateId: string | undefined,
  userId: string,
  actionKey: "apple_bridge_create" | "gmail_test_notification",
): Promise<boolean> {
  if (
    !gateId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(gateId)
  ) {
    return false;
  }
  const { data, error } = await service
    .from("mfa_action_gates")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", gateId)
    .eq("user_id", userId)
    .eq("action_key", actionKey)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  return !error && !!data;
}
