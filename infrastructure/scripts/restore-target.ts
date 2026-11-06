import { isIP } from 'node:net';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface IsolatedLocalRecoveryTarget {
  workdir: string;
  projectId: string;
}

export interface RecoveryBucketPage {
  objectCount: number;
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export async function assertRecoveryBucketEmpty(
  listObjects: (continuationToken?: string) => Promise<RecoveryBucketPage>,
): Promise<void> {
  let continuationToken: string | undefined;
  const seenTokens = new Set<string>();
  do {
    const page = await listObjects(continuationToken);
    if (!Number.isSafeInteger(page.objectCount) || page.objectCount < 0) {
      throw new Error('restore_bucket_listing_invalid');
    }
    if (page.objectCount > 0) throw new Error('restore_target_bucket_not_empty');
    if (!page.isTruncated) return;
    const nextToken = page.nextContinuationToken;
    if (!nextToken || seenTokens.has(nextToken)) {
      throw new Error('restore_bucket_listing_invalid');
    }
    seenTokens.add(nextToken);
    continuationToken = nextToken;
  } while (true);
}

function isWithinPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === '' ||
    (!isAbsolute(pathFromRoot) && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`))
  );
}

function tomlAssignment(text: string, sectionName: string, keyName: string): string | undefined {
  let section = '';
  for (const line of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
    if (header) {
      section = header[1] ?? '';
      continue;
    }
    if (section !== sectionName) continue;
    const assignment = new RegExp(`^\\s*${keyName}\\s*=\\s*(?:"([^"]+)"|(\\d+))\\s*(?:#.*)?$`).exec(
      line,
    );
    if (assignment) return assignment[1] ?? assignment[2];
  }
  return undefined;
}

export function assertLoopbackS3Endpoint(endpoint: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('restore_local_s3_endpoint_invalid');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const localAddress = hostname === '127.0.0.1' || (isIP(hostname) === 6 && hostname === '::1');
  if (
    parsed.protocol !== 'http:' ||
    !localAddress ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('restore_local_s3_endpoint_not_loopback');
  }
  return parsed.origin;
}

function assertIsolatedLocalProject(
  workdir: string,
  repositoryRoot: string,
  configText: string,
  forbiddenProjectIds: readonly string[],
): IsolatedLocalRecoveryTarget {
  if (!workdir || !isAbsolute(workdir)) throw new Error('restore_local_workdir_invalid');
  const resolvedWorkdir = resolve(workdir);
  const resolvedRoot = resolve(repositoryRoot);
  if (isWithinPath(resolvedRoot, resolvedWorkdir)) {
    throw new Error('restore_local_target_not_isolated');
  }

  const projectId = tomlAssignment(configText, '', 'project_id');
  if (!projectId || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(projectId)) {
    throw new Error('restore_local_project_id_invalid');
  }
  if (projectId === 'ai-operations-local' || forbiddenProjectIds.includes(projectId)) {
    throw new Error('restore_local_project_id_not_isolated');
  }

  const apiPort = Number(tomlAssignment(configText, 'api', 'port'));
  const databasePort = Number(tomlAssignment(configText, 'db', 'port'));
  const shadowPort = Number(tomlAssignment(configText, 'db', 'shadow_port'));
  const allPorts: number[] = [];
  for (const line of configText.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
    if (header) continue;
    const assignment = /^\s*[A-Za-z0-9_-]*port\s*=\s*(\d+)\s*(?:#.*)?$/.exec(line);
    if (assignment) allPorts.push(Number(assignment[1]));
  }
  const requiredPorts = [apiPort, databasePort, shadowPort];
  if (
    requiredPorts.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) ||
    new Set(allPorts).size !== allPorts.length ||
    allPorts.some((port) => port < 1024 || port > 65535 || (port >= 54320 && port <= 54329))
  ) {
    throw new Error('restore_local_ports_not_isolated');
  }

  return { workdir: resolvedWorkdir, projectId };
}

export function assertIsolatedLocalRecoveryTarget(
  workdir: string,
  repositoryRoot: string,
  configText: string,
  sourceProjectRef: string,
  productionProjectRef: string,
): IsolatedLocalRecoveryTarget {
  if (!sourceProjectRef || !productionProjectRef) {
    throw new Error('restore_local_target_not_isolated');
  }
  return assertIsolatedLocalProject(workdir, repositoryRoot, configText, [
    sourceProjectRef,
    productionProjectRef,
  ]);
}

export function assertIsolatedLocalSourceProject(
  workdir: string,
  repositoryRoot: string,
  configText: string,
  productionProjectRef: string,
): IsolatedLocalRecoveryTarget {
  if (!productionProjectRef) throw new Error('restore_local_target_not_isolated');
  return assertIsolatedLocalProject(workdir, repositoryRoot, configText, [productionProjectRef]);
}

export async function readIsolatedLocalSourceProject(
  workdir: string,
  repositoryRoot: string,
  productionProjectRef: string,
): Promise<IsolatedLocalRecoveryTarget> {
  if (!isAbsolute(workdir)) throw new Error('restore_local_workdir_invalid');
  let resolvedWorkdir: string;
  let resolvedRoot: string;
  try {
    [resolvedWorkdir, resolvedRoot] = await Promise.all([
      realpath(workdir),
      realpath(repositoryRoot),
    ]);
  } catch {
    throw new Error('restore_local_workdir_missing');
  }
  let configText: string;
  try {
    configText = await readFile(join(resolvedWorkdir, 'supabase', 'config.toml'), 'utf8');
  } catch {
    throw new Error('restore_local_config_missing');
  }
  return assertIsolatedLocalSourceProject(
    resolvedWorkdir,
    resolvedRoot,
    configText,
    productionProjectRef,
  );
}

export async function readIsolatedLocalRecoveryTarget(
  workdir: string,
  repositoryRoot: string,
  sourceProjectRef: string,
  productionProjectRef: string,
): Promise<IsolatedLocalRecoveryTarget> {
  if (!isAbsolute(workdir)) throw new Error('restore_local_workdir_invalid');
  let resolvedWorkdir: string;
  let resolvedRoot: string;
  try {
    [resolvedWorkdir, resolvedRoot] = await Promise.all([
      realpath(workdir),
      realpath(repositoryRoot),
    ]);
  } catch {
    throw new Error('restore_local_workdir_missing');
  }
  let configText: string;
  try {
    configText = await readFile(join(resolvedWorkdir, 'supabase', 'config.toml'), 'utf8');
  } catch {
    throw new Error('restore_local_config_missing');
  }
  return assertIsolatedLocalRecoveryTarget(
    resolvedWorkdir,
    resolvedRoot,
    configText,
    sourceProjectRef,
    productionProjectRef,
  );
}
