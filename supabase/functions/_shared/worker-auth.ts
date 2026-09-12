import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.57.0";

export type WorkerDevice = {
  id: string;
  user_id: string;
  public_key_b64: string;
  state: string;
  revoked_at: string | null;
};

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export async function authenticateWorker(
  request: Request,
  deviceId: string,
  client: SupabaseClient = service,
): Promise<
  { device: WorkerDevice } | { code: "unauthorised" | "device_revoked" }
> {
  const providedSecret = request.headers.get("x-worker-secret");
  if (!providedSecret || providedSecret.length < 32) {
    return { code: "unauthorised" };
  }
  const result = await client.from("worker_devices").select(
    "id,user_id,public_key_b64,state,revoked_at,worker_secret_hash",
  ).eq("id", deviceId).maybeSingle();
  if (result.error || !result.data) return { code: "unauthorised" };
  if (result.data.state === "revoked" || result.data.revoked_at) {
    return { code: "device_revoked" };
  }
  if (
    !result.data.worker_secret_hash ||
    !constantTimeEqual(
      await hash(providedSecret),
      result.data.worker_secret_hash,
    )
  ) return { code: "unauthorised" };
  return {
    device: {
      id: result.data.id,
      user_id: result.data.user_id,
      public_key_b64: result.data.public_key_b64,
      state: result.data.state,
      revoked_at: result.data.revoked_at,
    },
  };
}

export async function createWorkerSecret(): Promise<
  { raw: string; hash: string }
> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-")
    .replaceAll("/", "_").replaceAll("=", "");
  return { raw, hash: await hash(raw) };
}

export { hash as hashWorkerSecret, service as workerService };
