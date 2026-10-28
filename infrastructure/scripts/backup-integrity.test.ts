import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  decryptBackupPayload,
  encryptBackupPayload,
  parseBackupKey,
  sha256Hex,
  validateBackupPayload,
  verifyArchiveObjectReadback,
} from './backup-integrity.js';

function payload() {
  const sql = Buffer.from("insert into public.app_users values ('synthetic');");
  const object = Buffer.from('synthetic archive bytes');
  return {
    manifest: {
      formatVersion: 1 as const,
      sourceEnvironment: 'staging' as const,
      sourceProjectRef: 'staging-project-ref',
      migrationVersion: '20261021131411',
      sourceCommit: 'a'.repeat(40),
      keyVersion: 'staging-2026-10',
      createdAt: '2026-10-21T13:00:00.000Z',
      database: { sha256: sha256Hex(sql), sizeBytes: sql.byteLength },
      rowCounts: {
        auth_users: 1,
        app_users: 1,
        source_objects: 1,
        archive_manifests: 0,
        trace_events: 1,
        evidence_references: 1,
        linked_source_evidence: 1,
        archived_traces: 1,
      },
      objects: [
        {
          key: 'staging/synthetic/trace.json',
          sha256: sha256Hex(object),
          sizeBytes: object.byteLength,
          contentType: 'application/json',
        },
      ],
    },
    databaseSqlBase64: sql.toString('base64'),
    objectsBase64: { 'staging/synthetic/trace.json': object.toString('base64') },
  };
}

test('encrypted backup envelope round-trips a manifest, SQL dump and exact R2 bytes', () => {
  const key = randomBytes(32);
  const envelope = encryptBackupPayload(payload(), key);
  assert.equal(envelope.subarray(0, 8).toString(), 'AIOPSBK1');
  assert.equal(envelope.includes(Buffer.from('synthetic archive bytes')), false);
  const restored = decryptBackupPayload(envelope, key);
  assert.deepEqual(restored, payload());
});

test('AES-GCM authentication rejects a corrupted or wrong-key backup before restore', () => {
  const key = randomBytes(32);
  const envelope = encryptBackupPayload(payload(), key);
  const corrupted = Buffer.from(envelope);
  corrupted[corrupted.length - 1] ^= 0x01;
  assert.throws(
    () => decryptBackupPayload(corrupted, key),
    /backup_decryption_or_integrity_failed/,
  );
  assert.throws(
    () => decryptBackupPayload(envelope, Buffer.alloc(32)),
    /backup_decryption_or_integrity_failed/,
  );
});

test('manifest validation fails closed on a missing, extra, truncated or hash-mismatched R2 object', () => {
  const good = payload();
  const missing = structuredClone(good);
  missing.objectsBase64 = {};
  assert.throws(() => validateBackupPayload(missing), /backup_object_set_mismatch/);

  const extra = structuredClone(good);
  extra.objectsBase64['staging/synthetic/other.bin'] = Buffer.from('extra').toString('base64');
  assert.throws(() => validateBackupPayload(extra), /backup_object_set_mismatch/);

  const truncated = structuredClone(good);
  truncated.objectsBase64['staging/synthetic/trace.json'] = Buffer.from('short').toString('base64');
  assert.throws(() => validateBackupPayload(truncated), /backup_object_integrity_mismatch/);

  const wrongHash = structuredClone(good);
  wrongHash.manifest.objects[0]!.sha256 = 'b'.repeat(64);
  assert.throws(() => validateBackupPayload(wrongHash), /backup_object_integrity_mismatch/);
});

test('encryption key must be canonical base64 for exactly 256 bits', () => {
  const encoded = randomBytes(32).toString('base64');
  assert.equal(parseBackupKey(encoded).byteLength, 32);
  assert.throws(() => parseBackupKey('not-a-key'), /backup_encryption_key_invalid/);
  assert.throws(
    () => parseBackupKey(Buffer.alloc(31).toString('base64')),
    /backup_encryption_key_invalid/,
  );
});

test('archive object read-back verifies bytes, MIME and optional object SHA metadata', () => {
  const bytes = Buffer.from('synthetic archive bytes');
  const expected = {
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
    contentType: 'application/json',
  };
  verifyArchiveObjectReadback(expected, {
    bytes,
    contentType: expected.contentType,
    metadataSha256: expected.sha256,
  });
  assert.throws(
    () => verifyArchiveObjectReadback(expected, { bytes, contentType: 'text/plain' }),
    /backup_object_content_type_mismatch/,
  );
  assert.throws(
    () =>
      verifyArchiveObjectReadback(expected, {
        bytes,
        contentType: expected.contentType,
        metadataSha256: 'b'.repeat(64),
      }),
    /backup_object_metadata_sha256_mismatch/,
  );
});
