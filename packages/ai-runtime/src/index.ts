export type AiCallBoundary = Readonly<{
  model: string;
  maximumCostUsd: string;
  correlationId: string;
}>;

/** Deterministic guard used before any future provider invocation. */
export function canReserveCost(amountUsd: number, hardCapUsd: number): boolean {
  return Number.isFinite(amountUsd) && amountUsd >= 0 && amountUsd <= hardCapUsd;
}
