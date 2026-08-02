import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

Deno.serve(async (request) => {
  if (request.method !== "GET") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return json({ code: "unauthorised" }, 401);
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: token } } },
  );
  const { data: userData } = await client.auth.getUser();
  if (
    !userData.user ||
    userData.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) {
    return json({ code: "forbidden" }, 403);
  }
  const { data, error } = await client
    .from("managers")
    .select("code,name,description,enabled,risk_class")
    .order("code");
  return error ? json({ code: "query_failed" }, 500) : json({ managers: data });
});
