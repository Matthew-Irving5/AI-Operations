export const MAX_ARCHIVE_BYTES = 1_000_000;

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (leftBytes[index % Math.max(leftBytes.length, 1)] ?? 0) ^
      (rightBytes[index % Math.max(rightBytes.length, 1)] ?? 0);
  }
  return difference === 0;
}

export function sanitizeArchiveFilename(value: string): string {
  const filename = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  return filename || 'statement.csv';
}

export function buildArchiveObjectKey(
  environment: string | undefined,
  userId: string,
  digest: string,
  filename: string,
  objectId: string,
  capturedAt = new Date(),
): string {
  const prefix = environment === 'production' ? 'prod' : 'staging';
  const year = capturedAt.getUTCFullYear().toString().padStart(4, '0');
  const month = (capturedAt.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = capturedAt.getUTCDate().toString().padStart(2, '0');
  return `${prefix}/${userId}/finance/${year}/${month}/${day}/statement/${digest.slice(0, 2)}/${objectId}-${sanitizeArchiveFilename(filename)}`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
