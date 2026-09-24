import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseGithubRepositories } from "./github-contract.ts";

Deno.test("accepts repositories owned by the allowlisted account", () => {
  assertEquals(
    parseGithubRepositories([{
      id: 42,
      name: "AI-Operations",
      owner: { login: "Matthew-Irving5" },
      html_url: "https://github.com/Matthew-Irving5/AI-Operations",
    }]),
    {
      repositories: [{
        id: 42,
        name: "AI-Operations",
        ownerLogin: "Matthew-Irving5",
        htmlUrl: "https://github.com/Matthew-Irving5/AI-Operations",
      }],
    },
  );
});

Deno.test("rejects BrightSG and malformed owner URLs before persistence", () => {
  assertEquals(
    parseGithubRepositories([{
      id: 43,
      name: "forbidden",
      owner: { login: "BrightSG" },
      html_url: "https://github.com/BrightSG/forbidden",
    }]),
    { error: "owner_denied" },
  );
  assertEquals(
    parseGithubRepositories([{
      id: 44,
      name: "spoofed",
      owner: { login: "Matthew-Irving5" },
      html_url: "https://evil.example/Matthew-Irving5/spoofed",
    }]),
    { error: "owner_denied" },
  );
});

Deno.test("rejects a non-array provider response", () => {
  assertEquals(parseGithubRepositories({ message: "rate limit" }), {
    error: "invalid_response",
  });
});
