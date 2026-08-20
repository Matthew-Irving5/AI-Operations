export const MOBILE_LIMITS = {
  requestBytes: 1_000_000,
  sources: 32,
  records: 500,
  recordBytes: 64_000,
  nestingDepth: 12,
} as const;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${
    entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${canonicalJson(item)}`
    ).join(",")
  }}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function jsonDepth(value: unknown, depth = 0): number {
  if (value === null || typeof value !== "object") return depth;
  const values = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  return values.reduce(
    (maximum, item) => Math.max(maximum, jsonDepth(item, depth + 1)),
    depth,
  );
}
