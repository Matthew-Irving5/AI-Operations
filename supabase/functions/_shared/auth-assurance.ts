import { authenticateUserToken, type UserLookup } from "./auth-contract.ts";

type AuthenticatedUser = {
  id: string;
  email?: string | null;
};

type AccessTokenClaims = {
  sub?: unknown;
  aal?: unknown;
};

function readAccessTokenClaims(jwt: string): AccessTokenClaims | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;

  try {
    const payload = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const decoded = atob(
      payload.padEnd(Math.ceil(payload.length / 4) * 4, "="),
    );
    const bytes = Uint8Array.from(
      decoded,
      (character) => character.charCodeAt(0),
    );
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
      return null;
    }
    return claims as AccessTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Edge Functions have no persisted Auth session. Validate the supplied JWT
 * with Auth first, then read its signed AAL claim and bind it to that user.
 */
export async function getAal2Identity(
  jwt: string,
  lookupUser: UserLookup,
): Promise<{ user: AuthenticatedUser | null }> {
  if (!jwt.trim()) return { user: null };
  const user = await authenticateUserToken(jwt, lookupUser);
  if (!user) return { user: null };

  const claims = readAccessTokenClaims(jwt);
  if (claims?.sub !== user.id || claims.aal !== "aal2") {
    return { user: null };
  }
  return { user };
}
