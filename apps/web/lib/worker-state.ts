export type WorkerDisplayState = 'active' | 'online' | 'offline' | 'revoked';

export function workerDisplayState(
  device: Readonly<{ state: string; last_heartbeat_at: string | null }>,
  nowMs = Date.now(),
): WorkerDisplayState {
  if (device.state === 'revoked') return 'revoked';
  const heartbeatMs = device.last_heartbeat_at ? Date.parse(device.last_heartbeat_at) : NaN;
  if (!Number.isFinite(heartbeatMs) || heartbeatMs < nowMs - 2 * 60_000) return 'offline';
  return device.state === 'active' ? 'active' : 'online';
}

export function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
