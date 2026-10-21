import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseGithubAuthenticatedUser,
  parseGithubCommitEvidence,
  parseGithubDocumentationEvidence,
  parseGithubPullRequestEvidence,
  parseGithubReleaseEvidence,
  parseGithubRepositories,
  parseGithubSyncRequest,
  requestGithubRepositories,
  requestGithubRepositoriesForAuthenticatedUser,
} from "./github-contract.ts";

const mfaGateId = "00000000-0000-4000-8000-000000000101";

Deno.test("validates the exact request shape and rejects targeted owners", () => {
  assertEquals(parseGithubSyncRequest({ mfaGateId }), {
    request: { mfaGateId },
  });
  for (
    const payload of [
      { mfaGateId, owner: "BrightSG" },
      { mfaGateId, owner: "brightsG" },
      { mfaGateId, repositoryOwner: "BrightSG" },
      { mfaGateId, owner: "Matthew-Irving5", repositoryOwner: "BrightSG" },
      { mfaGateId, repository_owner: "SomeOtherOwner" },
      { mfaGateId, repository: "BrightSG/private-repo" },
      { mfaGateId, repository: { owner: { login: "BrightSG" } } },
    ]
  ) {
    const parsed = parseGithubSyncRequest(payload);
    assertEquals(
      "error" in parsed ? parsed.error : null,
      payload.repository_owner ? "owner_not_allowlisted" : "owner_hard_denied",
    );
  }
  assertEquals(parseGithubSyncRequest({ mfaGateId, extra: true }), {
    error: "invalid_request",
  });
});

Deno.test("rejects owner targets before invoking the GitHub request callback", async () => {
  let requestCount = 0;
  for (const owner of ["BrightSG", "brightsG", "OtherOwner"]) {
    await assertRejects(
      () =>
        requestGithubRepositories(owner, () => {
          requestCount += 1;
          return new Response("[]");
        }),
      Error,
    );
  }
  assertEquals(requestCount, 0);

  const response = await requestGithubRepositories("Matthew-Irving5", (url) => {
    requestCount += 1;
    assertEquals(
      url,
      "https://api.github.com/users/Matthew-Irving5/repos?per_page=100&sort=updated&affiliation=owner",
    );
    return new Response("[]");
  });
  assertEquals(response.status, 200);
  assertEquals(requestCount, 1);
});

Deno.test("authenticated token identity gates every repository request", async () => {
  let requestCount = 0;
  for (const login of ["BrightSG", "brightsG", "OtherOwner"]) {
    const result = await requestGithubRepositoriesForAuthenticatedUser({
      login,
    }, () => {
      requestCount += 1;
      return new Response("[]");
    });
    assertEquals(
      "error" in result ? result.error : null,
      login.toLowerCase() === "brightsg"
        ? "owner_hard_denied"
        : "owner_not_allowlisted",
    );
  }
  assertEquals(parseGithubAuthenticatedUser({ login: "Matthew-Irving5" }), {
    user: { login: "Matthew-Irving5" },
  });
  const accepted = await requestGithubRepositoriesForAuthenticatedUser(
    { login: "Matthew-Irving5" },
    (url) => {
      requestCount += 1;
      assertEquals(
        url,
        "https://api.github.com/users/Matthew-Irving5/repos?per_page=100&sort=updated&affiliation=owner",
      );
      return new Response("[]");
    },
  );
  assertEquals("response" in accepted, true);
  assertEquals(requestCount, 1);
});

Deno.test("normalizes dated personal repository evidence without retaining provider prose", () => {
  const sha = "a".repeat(40);
  const commit = {
    sha,
    html_url: `https://github.com/Matthew-Irving5/AI-Operations/commit/${sha}`,
    author: { login: "Matthew-Irving5" },
    commit: {
      author: { date: "2026-10-20T12:00:00Z" },
      message: "must not be retained",
    },
  };
  const pull = {
    number: 17,
    html_url: "https://github.com/Matthew-Irving5/AI-Operations/pull/17",
    user: { login: "Matthew-Irving5" },
    merged_at: "2026-10-19T12:00:00Z",
    title: "must not be retained",
  };
  const release = {
    id: 27,
    html_url:
      "https://github.com/Matthew-Irving5/AI-Operations/releases/tag/v1",
    author: { login: "Matthew-Irving5" },
    published_at: "2026-10-18T12:00:00Z",
    body: "must not be retained",
    tag_name: "v1",
  };
  assertEquals(
    parseGithubCommitEvidence([commit], "AI-Operations")?.[0].sourceDate,
    "2026-10-20T12:00:00.000Z",
  );
  assertEquals(
    parseGithubPullRequestEvidence([pull], "AI-Operations")?.[0].sourceDate,
    "2026-10-19T12:00:00.000Z",
  );
  assertEquals(
    parseGithubReleaseEvidence([release], "AI-Operations")?.[0].sourceDate,
    "2026-10-18T12:00:00.000Z",
  );
  assertEquals(
    parseGithubDocumentationEvidence(
      {
        path: "README.md",
        html_url:
          "https://github.com/Matthew-Irving5/AI-Operations/blob/main/README.md",
      },
      [commit],
      "AI-Operations",
    )?.[0].payload,
    {
      kind: "documentation",
      path: "README.md",
      sha,
      author: "Matthew-Irving5",
    },
  );
  assertEquals(
    JSON.stringify(parseGithubCommitEvidence([commit], "AI-Operations"))
      .includes(
        "must not be retained",
      ),
    false,
  );
});

Deno.test("accepts repositories owned by the allowlisted account", () => {
  assertEquals(
    parseGithubRepositories([
      {
        id: 42,
        name: "AI-Operations",
        owner: { login: "Matthew-Irving5" },
        html_url: "https://github.com/Matthew-Irving5/AI-Operations",
      },
    ]),
    {
      repositories: [
        {
          id: 42,
          name: "AI-Operations",
          ownerLogin: "Matthew-Irving5",
          htmlUrl: "https://github.com/Matthew-Irving5/AI-Operations",
          updatedAt: null,
          language: null,
        },
      ],
    },
  );
});

Deno.test("rejects BrightSG and malformed owner URLs before persistence", () => {
  assertEquals(
    parseGithubRepositories([
      {
        id: 43,
        name: "forbidden",
        owner: { login: "BrightSG" },
        html_url: "https://github.com/BrightSG/forbidden",
      },
    ]),
    { error: "owner_denied" },
  );
  assertEquals(
    parseGithubRepositories([
      {
        id: 44,
        name: "spoofed",
        owner: { login: "Matthew-Irving5" },
        html_url: "https://evil.example/Matthew-Irving5/spoofed",
      },
    ]),
    { error: "owner_denied" },
  );
  assertEquals(
    parseGithubRepositories([
      {
        id: 45,
        name: "expected-repository",
        owner: { login: "Matthew-Irving5" },
        html_url: "https://github.com/Matthew-Irving5/different-repository",
      },
    ]),
    { error: "owner_denied" },
  );
});

Deno.test("rejects a non-array provider response", () => {
  assertEquals(parseGithubRepositories({ message: "rate limit" }), {
    error: "invalid_response",
  });
});
