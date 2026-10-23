import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';

const MAGIC = Buffer.from('AIOPSBK1');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_BACKUP_BYTES = 1024 * 1024 * 1024;

const BackupObjectSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(1024)
    .refine((key) => !key.includes('..') && !key.startsWith('/')),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative().max(MAX_BACKUP_BYTES),
  contentType: z.string().min(1).max(120),
});

export const BackupPayloadSchema = z.object({
  manifest: z
    .object({
      formatVersion: z.literal(1),
      sourceEnvironment: z.enum(['staging', 'production']),
      sourceProjectRef: z.string().min(5).max(64),
      migrationVersion: z.string().regex(/^(0|[0-9]{14})$/),
      sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      keyVersion: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
      createdAt: z.string().datetime({ offset: true }),
      database: z.object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        sizeBytes: z.number().int().positive().max(MAX_BACKUP_BYTES),
      }),
      rowCounts: z
        .object({
          auth_users: z.number().int().nonnegative(),
          app_users: z.number().int().nonnegative(),
          source_objects: z.number().int().nonnegative(),
          archive_manifests: z.number().int().nonnegative(),
          trace_events: z.number().int().nonnegative(),
          evidence_references: z.number().int().nonnegative(),
          linked_source_evidence: z.number().int().nonnegative(),
          archived_traces: z.number().int().nonnegative(),
        })
        .strict(),
      objects: z.array(BackupObjectSchema).max(100_000),
    })
    .superRefine((manifest, context) => {
      const keys = manifest.objects.map((object) => object.key);
      if (new Set(keys).size !== keys.length) {
        context.addIssue({ code: 'custom', path: ['objects'], message: 'duplicate object key' });
      }
    }),
  databaseSqlBase64: z.string().min(1),
  objectsBase64: z.record(z.string(), z.string()),
});

export type BackupPayload = z.infer<typeof BackupPayloadSchema>;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyArchiveObjectReadback(
  expected: { sha256: string; sizeBytes: number; contentType?: string },
  actual: { bytes: Uint8Array; contentType?: string; metadataSha256?: string },
): void {
  if (actual.bytes.byteLength !== expected.sizeBytes) {
    throw new Error('backup_object_size_mismatch');
  }
  if (sha256Hex(actual.bytes) !== expected.sha256) {
    throw new Error('backup_object_integrity_mismatch');
  }
  if (expected.contentType && actual.contentType !== expected.contentType) {
    throw new Error('backup_object_content_type_mismatch');
  }
  if (actual.metadataSha256 && actual.metadataSha256 !== expected.sha256) {
    throw new Error('backup_object_metadata_sha256_mismatch');
  }
}

export function parseBackupKey(encoded: string): Buffer {
  let key: Buffer;
  try {
    key = Buffer.from(encoded, 'base64');
  } catch {
    throw new Error('backup_encryption_key_invalid');
  }
  if (key.byteLength !== 32 || key.toString('base64') !== encoded) {
    throw new Error('backup_encryption_key_invalid');
  }
  return key;
}

export function validateBackupPayload(input: unknown): BackupPayload {
  const payload = BackupPayloadSchema.parse(input);
  const databaseSql = Buffer.from(payload.databaseSqlBase64, 'base64');
  if (
    databaseSql.toString('base64') !== payload.databaseSqlBase64 ||
    databaseSql.byteLength !== payload.manifest.database.sizeBytes ||
    sha256Hex(databaseSql) !== payload.manifest.database.sha256
  ) {
    throw new Error('backup_database_integrity_mismatch');
  }
  const manifestKeys = new Set(payload.manifest.objects.map((object) => object.key));
  if (Object.keys(payload.objectsBase64).length !== manifestKeys.size) {
    throw new Error('backup_object_set_mismatch');
  }
  for (const object of payload.manifest.objects) {
    const encoded = payload.objectsBase64[object.key];
    if (encoded === undefined) throw new Error('backup_object_missing');
    const bytes = Buffer.from(encoded, 'base64');
    if (
      bytes.toString('base64') !== encoded ||
      bytes.byteLength !== object.sizeBytes ||
      sha256Hex(bytes) !== object.sha256
    ) {
      throw new Error('backup_object_integrity_mismatch');
    }
  }
  for (const key of Object.keys(payload.objectsBase64)) {
    if (!manifestKeys.has(key)) throw new Error('backup_object_set_mismatch');
  }
  const bundleBytes =
    databaseSql.byteLength +
    payload.manifest.objects.reduce((total, object) => total + object.sizeBytes, 0);
  if (bundleBytes > MAX_BACKUP_BYTES) throw new Error('backup_bundle_oversize');
  return payload;
}

export function encryptBackupPayload(input: unknown, key: Uint8Array): Buffer {
  if (key.byteLength !== 32) throw new Error('backup_encryption_key_invalid');
  const payload = validateBackupPayload(input);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBackupPayload(envelope: Uint8Array, key: Uint8Array): BackupPayload {
  if (key.byteLength !== 32) throw new Error('backup_encryption_key_invalid');
  const bytes = Buffer.from(envelope);
  if (
    bytes.byteLength < MAGIC.byteLength + IV_BYTES + TAG_BYTES ||
    !bytes.subarray(0, MAGIC.length).equals(MAGIC)
  ) {
    throw new Error('backup_envelope_invalid');
  }
  const ivStart = MAGIC.byteLength;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(ivStart, tagStart));
    decipher.setAuthTag(bytes.subarray(tagStart, ciphertextStart));
    const compressed = Buffer.concat([
      decipher.update(bytes.subarray(ciphertextStart)),
      decipher.final(),
    ]);
    const parsed: unknown = JSON.parse(gunzipSync(compressed).toString('utf8'));
    return validateBackupPayload(parsed);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('backup_')) throw error;
    throw new Error('backup_decryption_or_integrity_failed');
  }
}
