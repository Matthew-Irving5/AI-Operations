const sensitiveKey = /password|secret|token|authorization|cookie/i;
export function redactTraceFields(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      sensitiveKey.test(key) ? '[REDACTED]' : value,
    ]),
  );
}
