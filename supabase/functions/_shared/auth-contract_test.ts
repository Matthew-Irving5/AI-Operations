import {
  authenticateUserRequest,
  authenticateUserToken,
  readBearerToken,
  verifySharedSecret,
} from "./auth-contract.ts";

const assert = (condition: boolean) => {
  if (!condition) throw new Error("assertion_failed");
};

Deno.test("Bearer authentication rejects missing and malformed headers", async () => {
  let lookups = 0;
  const lookup = () => {
    lookups += 1;
    return Promise.resolve({ data: { user: { id: "user-1" } }, error: null });
  };
  for (
    const authorization of [
      null,
      "",
      "Bearer",
      "Bearer token extra",
      "Basic token",
    ]
  ) {
    const request = new Request("https://edge.test/function", {
      headers: authorization ? { authorization } : {},
    });
    assert(readBearerToken(request) === null);
    assert(await authenticateUserRequest(request, lookup) === null);
  }
  assert(lookups === 0);
});

Deno.test("Bearer authentication derives identity from a validated Supabase user lookup", async () => {
  const request = new Request("https://edge.test/function", {
    headers: { authorization: "bEaReR opaque-jwt" },
  });
  let checkedToken = "";
  const identity = await authenticateUserRequest(request, (token) => {
    checkedToken = token;
    return Promise.resolve({
      data: { user: { id: "owner-1", email: "owner@example.test" } },
      error: null,
    });
  });
  assert(checkedToken === "opaque-jwt");
  assert(identity?.accessToken === "opaque-jwt");
  assert(identity?.user.id === "owner-1");
  assert(identity?.user.email === "owner@example.test");
});

Deno.test("Bearer authentication fails closed for expired, revoked, invalid, or errored tokens", async () => {
  const request = new Request("https://edge.test/function", {
    headers: { authorization: "Bearer opaque-jwt" },
  });
  assert(
    await authenticateUserRequest(request, () =>
      Promise.resolve({
        data: { user: null },
        error: new Error("invalid_token"),
      })) === null,
  );
  assert(
    await authenticateUserRequest(
      request,
      () => Promise.resolve({ data: { user: null }, error: null }),
    ) === null,
  );
  assert(
    await authenticateUserRequest(
      request,
      () => Promise.reject(new Error("auth_unavailable")),
    ) === null,
  );
  assert(
    await authenticateUserToken(
      "   ",
      () => Promise.resolve({ data: { user: { id: "owner-1" } }, error: null }),
    ) ===
      null,
  );
});

Deno.test("shared-secret authentication rejects absent, malformed, short, and incorrect secrets", () => {
  const validSecret = "a".repeat(43);
  const makeRequest = (secret?: string) =>
    new Request("https://edge.test/function", {
      headers: secret === undefined ? {} : { "x-service-secret": secret },
    });
  assert(!verifySharedSecret(makeRequest(), "x-service-secret", validSecret));
  assert(
    !verifySharedSecret(
      makeRequest(validSecret),
      "x-service-secret",
      undefined,
    ),
  );
  assert(
    !verifySharedSecret(makeRequest("short"), "x-service-secret", validSecret),
  );
  const malformedSecret = `${validSecret.slice(0, 10)} ${
    validSecret.slice(10)
  }`;
  assert(
    !verifySharedSecret(
      makeRequest(malformedSecret),
      "x-service-secret",
      validSecret,
    ),
  );
  assert(
    !verifySharedSecret(
      makeRequest(validSecret),
      "x-service-secret",
      "b".repeat(43),
    ),
  );
  assert(
    verifySharedSecret(
      makeRequest(validSecret),
      "x-service-secret",
      validSecret,
    ),
  );
});
