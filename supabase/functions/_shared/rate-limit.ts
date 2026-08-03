import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

export async function consumeRateLimit(
  userId: string,
  operation: string,
  limit = 20,
): Promise<boolean> {
  const { data, error } = await service.rpc("consume_edge_request_quota", {
    p_user_id: userId,
    p_operation: operation,
    p_limit: limit,
  });
  return !error && data === true;
}
