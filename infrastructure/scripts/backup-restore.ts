import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  decryptBackupPayload,
  encryptBackupPayload,
  parseBackupKey,
  sha256Hex,
  verifyArchiveObjectReadback,
} from './backup-integrity.js';

const execFile = promisify(execFileCallback);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OBJECT_QUERY = `
  select distinct object_key, sha256, size_bytes, content_type
  from (
    select r2_key as object_key, sha256, size_bytes, mime_type as content_type from public.source_objects
    union all
    select r2_key, sha256, size_bytes, content_type from public.archive_manifests
    union all
    select archive_reference->>'objectKey', archive_reference->>'sha256',
      (archive_reference->>'sizeBytes')::bigint, archive_reference->>'contentType'
    from public.trace_events where archive_reference is not null
  ) refs where object_key is not null order by object_key`;
const MIGRATION_QUERY =
  "select coalesce(max(version)::text, '0') as migration_version from supabase_migrations.schema_migrations";
const ROW_COUNT_QUERY = `select jsonb_build_object(
  'auth_users', (select count(*) from auth.users),
  'app_users', (select count(*) from public.app_users),
  'source_objects', (select count(*) from public.source_objects),
  'archive_manifests', (select count(*) from public.archive_manifests),
  'trace_events', (select count(*) from public.trace_events),
  'evidence_references', (select count(*) from public.evidence_references),
  'linked_source_evidence', (select count(*) from public.evidence_references where source_object_id is not null),
  'archived_traces', (select count(*) from public.trace_events where archive_reference is not null)
) as row_counts`;

type QueryRow = Record<string, unknown>;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`backup_configuration_missing:${name}`);
  return value;
}

function requiredKeyVersion(environment: 'staging' | 'production'): string {
  const version = requiredEnv(`AI_OPS_${environment.toUpperCase()}_BACKUP_KEY_VERSION`);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(version)) throw new Error('backup_key_version_invalid');
  return version;
}

function redactedError(error: unknown): string {
  const candidate = error instanceof Error ? error.message : 'unknown';
  return candidate
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(?:access[_ -]?key|secret|token|password)[=: ]+[^\s"'<>]+/gi, '[REDACTED_CREDENTIAL]')
    .slice(0, 300);
}

async function supabase(args: string[], maxBuffer = 128 * 1024 * 1024): Promise<string> {
  const childEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: requiredEnv('SUPABASE_ACCESS_TOKEN') };
  try {
    const result = await execFile('corepack', ['pnpm', 'exec', 'supabase', ...args], {
      cwd: ROOT,
      env: childEnv,
      maxBuffer,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    throw new Error(`backup_supabase_command_failed:${redactedError(error)}`);
  }
}

function rowsMatching(stdout: string, requiredColumns: string[]): QueryRow[] {
  let parsed: unknown;
  try {
    const firstJson = stdout.indexOf('{');
    parsed = JSON.parse(firstJson >= 0 ? stdout.slice(firstJson) : stdout);
  } catch {
    throw new Error('backup_database_query_invalid_json');
  }
  const arrays: QueryRow[][] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (
        value.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
      ) {
        arrays.push(value as QueryRow[]);
      }
      for (const item of value) visit(item);
    } else if (typeof value === 'object' && value !== null) {
      for (const item of Object.values(value)) visit(item);
    }
  };
  visit(parsed);
  const rows = arrays.find(
    (items) => items.length > 0 && requiredColumns.every((key) => key in items[0]!),
  );
  if (rows) return rows;
  if (arrays.some((items) => items.length === 0)) return [];
  throw new Error('backup_database_query_shape_invalid');
}

function normalizedCounts(value: unknown): Record<string, number> {
  let counts = value;
  if (typeof counts === 'string') {
    try {
      counts = JSON.parse(counts) as unknown;
    } catch {
      throw new Error('backup_row_count_shape_invalid');
    }
  }
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) {
    throw new Error('backup_row_count_shape_invalid');
  }
  const normalized: Record<string, number> = {};
  for (const [name, raw] of Object.entries(counts)) {
    const numberValue = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isSafeInteger(numberValue) || numberValue < 0)
      throw new Error('backup_row_count_invalid');
    normalized[name] = numberValue;
  }
  return normalized;
}

async function queryRowCounts(projectRef: string): Promise<Record<string, number>> {
  const rows = rowsMatching(
    await supabase([
      'db',
      'query',
      '--project-ref',
      projectRef,
      '--output-format',
      'json',
      ROW_COUNT_QUERY,
    ]),
    ['row_counts'],
  );
  if (!rows[0]) throw new Error('backup_row_count_missing');
  return normalizedCounts(rows[0].row_counts);
}

function requiredR2Env(name: string): string {
  return requiredEnv(name);
}

export function assertIsolatedRestoreTarget(
  sourceProjectRef: string,
  targetProjectRef: string,
  productionProjectRef: string,
): void {
  if (
    !sourceProjectRef ||
    !targetProjectRef ||
    !productionProjectRef ||
    sourceProjectRef === productionProjectRef ||
    targetProjectRef === sourceProjectRef ||
    targetProjectRef === productionProjectRef
  ) {
    throw new Error('restore_target_project_not_isolated');
  }
}

function r2Client(accessKeyEnv: string, secretKeyEnv: string): S3Client {
  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredR2Env(accessKeyEnv),
      secretAccessKey: requiredR2Env(secretKeyEnv),
    },
  });
}

async function bodyBytes(
  body: { transformToByteArray(): Promise<Uint8Array> } | undefined,
): Promise<Buffer> {
  if (!body) throw new Error('backup_object_missing');
  return Buffer.from(await body.transformToByteArray());
}

async function readObjectResponse(client: S3Client, bucket: string, key: string) {
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

async function readBackup(
  client: S3Client,
  bucket: string,
  backupKey: string,
  expectedKeyVersion: string,
): Promise<Buffer> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: backupKey }));
  const encrypted = await bodyBytes(response.Body);
  if (response.Metadata?.['key-version'] !== expectedKeyVersion) {
    throw new Error('backup_key_version_mismatch');
  }
  if (response.Metadata?.['encryption-algorithm'] !== 'AES-256-GCM') {
    throw new Error('backup_encryption_metadata_mismatch');
  }
  if (response.Metadata?.['manifest-version'] !== '1') {
    throw new Error('backup_manifest_version_mismatch');
  }
  if (response.Metadata?.sha256 !== sha256Hex(encrypted)) {
    throw new Error('backup_checksum_metadata_mismatch');
  }
  return encrypted;
}

function safeTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

async function createBackup(): Promise<void> {
  const sourceEnvironment = requiredEnv('AI_OPS_BACKUP_SOURCE_ENV');
  if (sourceEnvironment !== 'staging' && sourceEnvironment !== 'production') {
    throw new Error('backup_source_environment_invalid');
  }
  const sourceProjectRef = requiredEnv(`AI_OPS_${sourceEnvironment.toUpperCase()}_PROJECT_REF`);
  const sourceBucket = requiredEnv(`AI_OPS_${sourceEnvironment.toUpperCase()}_ARCHIVE_BUCKET`);
  const backupBucket = requiredEnv(`AI_OPS_${sourceEnvironment.toUpperCase()}_BACKUP_BUCKET`);
  if (sourceBucket === backupBucket) throw new Error('backup_bucket_must_be_separate');
  const keyVersion = requiredKeyVersion(sourceEnvironment);
  const key = parseBackupKey(
    requiredEnv(`AI_OPS_${sourceEnvironment.toUpperCase()}_BACKUP_ENCRYPTION_KEY`),
  );
  const worktreeStatus = await execFile('git', ['status', '--porcelain'], {
    cwd: ROOT,
    windowsHide: true,
  });
  if (worktreeStatus.stdout.trim()) throw new Error('backup_source_worktree_dirty');
  const git = await execFile('git', ['rev-parse', 'HEAD'], { cwd: ROOT, windowsHide: true });
  const sourceR2 = r2Client('AI_OPS_R2_SOURCE_ACCESS_KEY_ID', 'AI_OPS_R2_SOURCE_SECRET_ACCESS_KEY');
  const backupR2 = r2Client('AI_OPS_R2_BACKUP_ACCESS_KEY_ID', 'AI_OPS_R2_BACKUP_SECRET_ACCESS_KEY');
  const temp = await mkdtemp(join(tmpdir(), 'ai-ops-backup-'));
  try {
    const databasePath = join(temp, 'database.sql');
    const migrationRows = rowsMatching(
      await supabase([
        'db',
        'query',
        '--project-ref',
        sourceProjectRef,
        '--output-format',
        'json',
        MIGRATION_QUERY,
      ]),
      ['migration_version'],
    );
    const migrationVersion = String(migrationRows[0]?.migration_version ?? '');
    if (!/^(0|\d{14})$/.test(migrationVersion)) throw new Error('backup_migration_version_invalid');
    const referenceRows = rowsMatching(
      await supabase([
        'db',
        'query',
        '--project-ref',
        sourceProjectRef,
        '--output-format',
        'json',
        OBJECT_QUERY,
      ]),
      ['object_key', 'sha256', 'size_bytes', 'content_type'],
    );
    const rowCounts = await queryRowCounts(sourceProjectRef);
    await supabase([
      'db',
      'dump',
      '--project-ref',
      sourceProjectRef,
      '--data-only',
      '--schema',
      'public,auth',
      '--exclude',
      'auth.audit_log_entries,auth.flow_state,auth.mfa_challenges,auth.mfa_factors,auth.mfa_amr_claims,auth.one_time_tokens,auth.refresh_tokens,auth.sessions,auth.schema_migrations',
      '--file',
      databasePath,
    ]);
    const databaseSql = await readFile(databasePath);
    const sourceObjects = new Map<
      string,
      { sha256: string; sizeBytes: number; contentType: string }
    >();
    for (const row of referenceRows) {
      const objectKey = String(row.object_key ?? '');
      const sha = String(row.sha256 ?? '').toLowerCase();
      const rawSize = row.size_bytes;
      const sizeBytes = rawSize == null ? -1 : Number(rawSize);
      const contentType = typeof row.content_type === 'string' ? row.content_type : '';
      if (
        !objectKey ||
        !/^[a-f0-9]{64}$/.test(sha) ||
        (sizeBytes !== -1 && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0))
      ) {
        throw new Error('backup_source_reference_invalid');
      }
      const previous = sourceObjects.get(objectKey);
      if (
        previous &&
        (previous.sha256 !== sha ||
          (sizeBytes >= 0 && previous.sizeBytes >= 0 && previous.sizeBytes !== sizeBytes) ||
          (contentType && previous.contentType && previous.contentType !== contentType))
      ) {
        throw new Error('backup_source_reference_conflict');
      }
      sourceObjects.set(objectKey, {
        sha256: sha,
        sizeBytes: sizeBytes >= 0 ? sizeBytes : (previous?.sizeBytes ?? -1),
        contentType: contentType || previous?.contentType || '',
      });
    }
    const manifestObjects: Array<{
      key: string;
      sha256: string;
      sizeBytes: number;
      contentType: string;
    }> = [];
    const objectsBase64: Record<string, string> = {};
    for (const [objectKey, expected] of sourceObjects) {
      const response = await readObjectResponse(sourceR2, sourceBucket, objectKey);
      const bytes = await bodyBytes(response.Body);
      verifyArchiveObjectReadback(
        {
          sha256: expected.sha256,
          sizeBytes: expected.sizeBytes >= 0 ? expected.sizeBytes : bytes.byteLength,
          ...(expected.contentType ? { contentType: expected.contentType } : {}),
        },
        {
          bytes,
          ...(response.ContentType ? { contentType: response.ContentType } : {}),
          ...(response.Metadata?.sha256 ? { metadataSha256: response.Metadata.sha256 } : {}),
        },
      );
      manifestObjects.push({
        key: objectKey,
        sha256: expected.sha256,
        sizeBytes: bytes.byteLength,
        contentType: expected.contentType || response.ContentType || 'application/octet-stream',
      });
      objectsBase64[objectKey] = bytes.toString('base64');
    }
    const payload = {
      manifest: {
        formatVersion: 1,
        sourceEnvironment,
        sourceProjectRef,
        migrationVersion,
        sourceCommit: git.stdout.trim(),
        keyVersion,
        createdAt: new Date().toISOString(),
        database: { sha256: sha256Hex(databaseSql), sizeBytes: databaseSql.byteLength },
        rowCounts,
        objects: manifestObjects,
      },
      databaseSqlBase64: databaseSql.toString('base64'),
      objectsBase64,
    };
    const encrypted = encryptBackupPayload(payload, key);
    const backupKey = `${sourceEnvironment}/backups/${safeTimestamp(new Date())}/${crypto.randomUUID()}.aiops.enc`;
    const backupSha256 = sha256Hex(encrypted);
    await backupR2.send(
      new PutObjectCommand({
        Bucket: backupBucket,
        Key: backupKey,
        Body: encrypted,
        ContentLength: encrypted.byteLength,
        ContentType: 'application/octet-stream',
        Metadata: {
          sha256: backupSha256,
          'encryption-algorithm': 'AES-256-GCM',
          'key-version': keyVersion,
          'manifest-version': '1',
        },
      }),
    );
    const readback = await readBackup(backupR2, backupBucket, backupKey, keyVersion);
    if (sha256Hex(readback) !== backupSha256) throw new Error('backup_upload_readback_mismatch');
    const restored = decryptBackupPayload(readback, key);
    if (
      restored.manifest.sourceProjectRef !== sourceProjectRef ||
      restored.manifest.keyVersion !== keyVersion
    )
      throw new Error('backup_manifest_readback_mismatch');
    process.stdout.write(
      JSON.stringify({
        status: 'verified',
        sourceEnvironment,
        backupKey,
        backupSha256,
        encryptedBytes: encrypted.byteLength,
        migrationVersion,
        objectCount: manifestObjects.length,
        keyVersion,
      }) + '\n',
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
    sourceR2.destroy();
    backupR2.destroy();
  }
}

async function loadBackup(backupKey: string, environment: 'staging' | 'production') {
  const backupBucket = requiredEnv(`AI_OPS_${environment.toUpperCase()}_BACKUP_BUCKET`);
  const client = r2Client('AI_OPS_R2_BACKUP_ACCESS_KEY_ID', 'AI_OPS_R2_BACKUP_SECRET_ACCESS_KEY');
  const key = parseBackupKey(
    requiredEnv(`AI_OPS_${environment.toUpperCase()}_BACKUP_ENCRYPTION_KEY`),
  );
  try {
    const keyVersion = requiredKeyVersion(environment);
    const encrypted = await readBackup(client, backupBucket, backupKey, keyVersion);
    const payload = decryptBackupPayload(encrypted, key);
    if (payload.manifest.sourceEnvironment !== environment) {
      throw new Error('backup_source_environment_mismatch');
    }
    if (payload.manifest.keyVersion !== keyVersion) {
      throw new Error('backup_key_version_mismatch');
    }
    return { payload, encrypted, client, backupBucket };
  } catch (error) {
    client.destroy();
    throw error;
  }
}

async function restoreBackup(
  backupKey: string,
  environment: 'staging' | 'production',
): Promise<void> {
  if (environment !== 'staging') throw new Error('production_backup_restore_forbidden');
  if (requiredEnv('AI_OPS_RESTORE_TARGET_ENV') !== 'staging-recovery') {
    throw new Error('restore_target_must_be_isolated_staging');
  }
  const targetProjectRef = requiredEnv('AI_OPS_STAGING_RECOVERY_PROJECT_REF');
  const sourceProjectRef = requiredEnv(`AI_OPS_${environment.toUpperCase()}_PROJECT_REF`);
  const productionProjectRef = requiredEnv('AI_OPS_PRODUCTION_PROJECT_REF');
  assertIsolatedRestoreTarget(sourceProjectRef, targetProjectRef, productionProjectRef);
  const recoveryBucket = requiredEnv('AI_OPS_STAGING_RECOVERY_ARCHIVE_BUCKET');
  const sourceArchiveBucket = requiredEnv(`AI_OPS_${environment.toUpperCase()}_ARCHIVE_BUCKET`);
  const backupBucket = requiredEnv(`AI_OPS_${environment.toUpperCase()}_BACKUP_BUCKET`);
  if (new Set([recoveryBucket, sourceArchiveBucket, backupBucket]).size !== 3) {
    throw new Error('restore_target_bucket_not_isolated');
  }
  const recoveryR2 = r2Client(
    'AI_OPS_R2_RECOVERY_ACCESS_KEY_ID',
    'AI_OPS_R2_RECOVERY_SECRET_ACCESS_KEY',
  );
  const {
    payload,
    encrypted,
    client,
    backupBucket: verifiedBackupBucket,
  } = await loadBackup(backupKey, environment);
  const backupSha = sha256Hex(encrypted);
  const keyVersion = requiredKeyVersion(environment);
  const temp = await mkdtemp(join(tmpdir(), 'ai-ops-restore-'));
  try {
    await supabase(['db', 'push', '--project-ref', targetProjectRef, '--yes']);
    const targetCounts = await queryRowCounts(targetProjectRef);
    if (Object.values(targetCounts).some((count) => count !== 0)) {
      throw new Error('restore_target_database_not_empty');
    }
    const dataPath = join(temp, 'database.sql');
    await writeFile(dataPath, Buffer.from(payload.databaseSqlBase64, 'base64'), { mode: 0o600 });
    await supabase(
      ['db', 'query', '--project-ref', targetProjectRef, '--file', dataPath],
      512 * 1024 * 1024,
    );
    for (const object of payload.manifest.objects) {
      const bytes = Buffer.from(payload.objectsBase64[object.key]!, 'base64');
      await recoveryR2.send(
        new PutObjectCommand({
          Bucket: recoveryBucket,
          Key: object.key,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: object.contentType,
          Metadata: { sha256: object.sha256, source: 'ai-operations-restore' },
        }),
      );
      const readback = await readObjectResponse(recoveryR2, recoveryBucket, object.key);
      verifyArchiveObjectReadback(object, {
        bytes: await bodyBytes(readback.Body),
        ...(readback.ContentType ? { contentType: readback.ContentType } : {}),
        ...(readback.Metadata?.sha256 ? { metadataSha256: readback.Metadata.sha256 } : {}),
      });
    }
    const restoredCounts = await queryRowCounts(targetProjectRef);
    const expectedCounts = payload.manifest.rowCounts;
    if (
      Object.keys(restoredCounts).length !== Object.keys(expectedCounts).length ||
      Object.entries(expectedCounts).some(([name, expected]) => restoredCounts[name] !== expected)
    ) {
      throw new Error('restore_database_row_counts_mismatch');
    }
    const userRows = rowsMatching(
      await supabase([
        'db',
        'query',
        '--project-ref',
        sourceProjectRef,
        '--output-format',
        'json',
        'select id::text as user_id from public.app_users order by id limit 1',
      ]),
      ['user_id'],
    );
    const userId = String(userRows[0]?.user_id ?? '');
    if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error('restore_user_record_missing');
    const migrationVersion = payload.manifest.migrationVersion;
    const sourceCommit = payload.manifest.sourceCommit;
    const objectCount = payload.manifest.objects.length;
    const databaseSha = payload.manifest.database.sha256;
    const insert = `insert into public.backup_restore_drills
      (user_id, backup_key, backup_sha256, encrypted, drill_status, restored_at, backup_size_bytes,
       database_sha256, object_count, manifest_version, migration_version, source_commit_sha,
       source_environment, encryption_algorithm, key_version)
      values ('${userId}', '${backupKey.replace(/'/g, "''")}', '${backupSha}', true, 'passed', now(),
       ${encrypted.byteLength}, '${databaseSha}', ${objectCount}, 1, '${migrationVersion}',
       '${sourceCommit}', '${environment}', 'AES-256-GCM', '${keyVersion.replace(/'/g, "''")}')`;
    await supabase(['db', 'query', '--project-ref', sourceProjectRef, insert]);
    process.stdout.write(
      JSON.stringify({
        status: 'restored-and-verified',
        targetEnvironment: 'staging-recovery',
        targetProjectRef,
        targetBucket: recoveryBucket,
        backupBucket: verifiedBackupBucket,
        backupSha256: backupSha,
        objectCount,
        migrationVersion,
        keyVersion,
      }) + '\n',
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
    client.destroy();
    recoveryR2.destroy();
  }
}

async function main(): Promise<void> {
  const [command, backupKeyArg, environmentArg] = process.argv.slice(2);
  if (command === 'create' && !backupKeyArg) return createBackup();
  if ((command === 'verify' || command === 'restore') && backupKeyArg) {
    const environment = environmentArg ?? process.env.AI_OPS_BACKUP_SOURCE_ENV;
    if (environment !== 'staging' && environment !== 'production')
      throw new Error('backup_source_environment_invalid');
    const { payload, encrypted, client } = await loadBackup(backupKeyArg, environment);
    try {
      const key = parseBackupKey(
        requiredEnv(`AI_OPS_${environment.toUpperCase()}_BACKUP_ENCRYPTION_KEY`),
      );
      const verified = decryptBackupPayload(encrypted, key);
      if (
        verified.manifest.sourceProjectRef !== payload.manifest.sourceProjectRef ||
        verified.manifest.keyVersion !== requiredKeyVersion(environment)
      )
        throw new Error('backup_manifest_mismatch');
      if (command === 'restore') return await restoreBackup(backupKeyArg, environment);
      process.stdout.write(
        JSON.stringify({
          status: 'verified',
          sourceEnvironment: environment,
          backupKey: backupKeyArg,
          backupSha256: sha256Hex(encrypted),
          migrationVersion: payload.manifest.migrationVersion,
          objectCount: payload.manifest.objects.length,
          keyVersion: requiredKeyVersion(environment),
        }) + '\n',
      );
      return;
    } finally {
      client.destroy();
    }
  }
  throw new Error(
    'usage: backup-restore.ts create | verify <backup-key> [staging|production] | restore <backup-key> [staging|production]',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'backup_failed'}\n`);
    process.exitCode = 1;
  });
}
