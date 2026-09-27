import { getAal2Identity } from "./auth-assurance.ts";

const assert = (condition: boolean) => {
  if (!condition) throw new Error("assertion_failed");
};

function tokenForClaims(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `header.${payload}.signature`;
}

Deno.test("AAL2 access token is checked after Auth validates the same JWT", async () => {
  const jwt = tokenForClaims({ sub: "user-1", aal: "aal2" });
  let receivedJwt = "";
  const identity = await getAal2Identity(jwt, (providedJwt) => {
    receivedJwt = providedJwt;
    return Promise.resolve({
      data: { user: { id: "user-1", email: "owner@example.com" } },
      error: null,
    });
  });

  assert(receivedJwt === jwt);
  assert(identity.user?.id === "user-1");
});

Deno.test("AAL2 access token rejects AAL1 and mismatched identity claims", async () => {
  const lookup = () =>
    Promise.resolve({
      data: { user: { id: "user-1" } },
      error: null,
    });
  assert(
    !(await getAal2Identity(
      tokenForClaims({ sub: "user-1", aal: "aal1" }),
      lookup,
    )).user,
  );
  assert(
    !(await getAal2Identity(
      tokenForClaims({ sub: "user-2", aal: "aal2" }),
      lookup,
    )).user,
  );
});

Deno.test("AAL2 access token rejects failed Auth validation and malformed JWTs", async () => {
  assert(
    !(await getAal2Identity(
      tokenForClaims({ sub: "user-1", aal: "aal2" }),
      () =>
        Promise.resolve({
          data: { user: null },
          error: new Error("invalid_token"),
        }),
    )).user,
  );
  assert(
    !(await getAal2Identity("not-a-jwt", () =>
      Promise.resolve({
        data: { user: { id: "user-1" } },
        error: null,
      }))).user,
  );
  assert(
    !(await getAal2Identity("  ", () =>
      Promise.resolve({
        data: { user: { id: "user-1" } },
        error: new Error("lookup_failed"),
      }))).user,
  );
});
