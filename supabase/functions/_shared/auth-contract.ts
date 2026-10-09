export type AuthenticatedUser = {
  id: string;
  email?: string | null;
};

export type UserLookup = (jwt: string) => Promise<{
  data: { user: AuthenticatedUser | null };
  error: unknown | null;
}>;

export type AuthenticatedIdentity = {
  accessToken: string;
  user: AuthenticatedUser;
};

export function readBearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(
    /^Bearer\s+(\S+)$/i,
  );
  return match?.[1] ?? null;
}

export async function authenticateUserToken(
  accessToken: string,
  lookupUser: UserLookup,
): Promise<AuthenticatedUser | null> {
  if (!accessToken.trim()) return null;
  try {
    const { data, error } = await lookupUser(accessToken);
    if (error || typeof data.user?.id !== "string" || !data.user.id.trim()) {
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}

export async function authenticateUserRequest(
  request: Request,
  lookupUser: UserLookup,
): Promise<AuthenticatedIdentity | null> {
  const accessToken = readBearerToken(request);
  if (!accessToken) return null;
  const user = await authenticateUserToken(accessToken, lookupUser);
  return user ? { accessToken, user } : null;
}

export function constantTimeSecretEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function isWellFormedSharedSecret(
  value: string | undefined,
): value is string {
  if (!value || value.trim() !== value) return false;
  const bytes = new TextEncoder().encode(value);
  return bytes.length >= 32 && bytes.length <= 4096 &&
    !bytes.some((byte) => byte < 0x20 || byte === 0x7f);
}

export function verifySharedSecret(
  request: Request,
  headerName: string,
  configuredSecret: string | undefined,
): boolean {
  const providedSecret = request.headers.get(headerName) ?? undefined;
  if (
    !isWellFormedSharedSecret(providedSecret) ||
    !isWellFormedSharedSecret(configuredSecret)
  ) return false;
  return constantTimeSecretEqual(providedSecret, configuredSecret);
}
