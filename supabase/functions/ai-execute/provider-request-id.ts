export function providerRequestId(
  runId: string,
  queueJobId: string,
  attemptCount: number,
): string {
  return `ai15:${runId}:job:${queueJobId}:attempt:${Math.max(1, attemptCount)}`;
}
