export const WORKER_HEARTBEAT_FRESHNESS_MS = 30 * 60 * 1000;

export function hasFreshWorkerHeartbeat(
  lastHeartbeatAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastHeartbeatAt) return false;
  const heartbeatMs = Date.parse(lastHeartbeatAt);
  return (
    Number.isFinite(heartbeatMs) &&
    heartbeatMs <= nowMs &&
    nowMs - heartbeatMs <= WORKER_HEARTBEAT_FRESHNESS_MS
  );
}

export function hasCompatibleWorkerHeartbeat(status: unknown): boolean {
  if (!status || typeof status !== "object") return false;
  const compatibility = (status as { compatibility?: unknown }).compatibility;
  return Boolean(
    compatibility &&
      typeof compatibility === "object" &&
      (compatibility as { compatible?: unknown }).compatible === true,
  );
}
