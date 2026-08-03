import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const allowedOwner = "Matthew-Irving5";
const deniedOwner = "BrightSG";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ code: "unauthorised" }, 401);
  // This function deliberately accepts no owner parameter: the endpoint is fixed to the personal account.
  if (allowedOwner === deniedOwner) {
    return json({ code: "github_owner_hard_denied" }, 403);
  }
  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: identity } = await client.auth.getUser();
  if (!identity.user) return json({ code: "unauthorised" }, 401);
  const token = Deno.env.get("GITHUB_PERSONAL_READ_TOKEN");
  if (!token) return json({ code: "github_connection_unavailable" }, 503);
  const response = await fetch(
    `https://api.github.com/users/${allowedOwner}/repos?per_page=100`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
      },
    },
  );
  if (!response.ok) return json({ code: "github_sync_unavailable" }, 502);
  const repositories = await response.json() as Array<
    {
      id?: number;
      name?: string;
      owner?: { login?: string };
      html_url?: string;
    }
  >;
  if (!Array.isArray(repositories)) {
    return json({ code: "github_sync_invalid_response" }, 502);
  }
  if (
    repositories.some(
      (repository) =>
        repository.owner?.login !== allowedOwner ||
        !Number.isSafeInteger(repository.id) ||
        !repository.name ||
        !repository.html_url?.startsWith(`https://github.com/${allowedOwner}/`),
    )
  ) return json({ code: "github_owner_hard_denied" }, 403);
  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const rows = repositories.map((repository) => ({
    user_id: identity.user!.id,
    repository_external_id: repository.id,
    repository_name: repository.name,
    owner_login: allowedOwner,
    evidence_kind: "repository",
    source_url: repository.html_url,
    retrieved_at: new Date().toISOString(),
    payload: { id: repository.id, name: repository.name },
  }));
  const { error } = await service.from("career_github_evidence").upsert(rows, {
    onConflict: "user_id,repository_external_id,evidence_kind,source_url",
  });
  return error
    ? json({ code: "github_evidence_store_failed" }, 500)
    : json({ repositories: rows.length, owner: allowedOwner });
});
