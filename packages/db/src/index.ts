export type AuditEvent = Readonly<{
  id: string;
  actorId: string;
  actionType: string;
  createdAt: string;
}>;
export const redact = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).map(([key, item]) =>
      /token|secret|password|address/i.test(key) ? [key, '[REDACTED]'] : [key, item],
    ),
  );
