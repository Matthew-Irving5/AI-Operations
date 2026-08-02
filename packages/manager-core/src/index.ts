export type ManagerCode =
  | 'finance'
  | 'career'
  | 'personal'
  | 'health'
  | 'systems'
  | 'digital_estate'
  | 'travel'
  | 'procurement';
export type ManagerInvocation = Readonly<{
  manager: ManagerCode;
  idempotencyKey: string;
  requestedAt: Date;
}>;

export function requireIdempotencyKey(value: string): string {
  if (!/^[a-z0-9][a-z0-9:_-]{7,127}$/i.test(value)) throw new Error('invalid_idempotency_key');
  return value;
}
