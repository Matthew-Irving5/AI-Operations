export type ModelId = 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol';
export type Pricing = Readonly<{ inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number; webSearchPerCall: number }>;
export type CostEstimateInput = Readonly<{ inputTokens: number; cachedInputTokens: number; outputTokens: number; searchCalls: number; retryAllowance: number }>;
export type ForecastInput = Readonly<{ actualCompleted: number; expectedCompleted: number; remainingRecurring: number; trailingFactor?: number; completedCalls: number }>;

export function estimateCost(pricing: Pricing, input: CostEstimateInput): number {
  const base = (input.inputTokens * pricing.inputPerMillion + input.cachedInputTokens * pricing.cachedInputPerMillion + input.outputTokens * pricing.outputPerMillion) / 1_000_000 + input.searchCalls * pricing.webSearchPerCall;
  return Math.ceil(base * (1 + input.retryAllowance) * 1_000_000) / 1_000_000;
}
export function canReserve(category: 'recurring' | 'on_demand', reserved: number, estimate: number, cap: number): boolean {
  return Number.isFinite(reserved) && Number.isFinite(estimate) && estimate >= 0 && reserved + estimate <= cap && (category === 'recurring' || category === 'on_demand');
}
export function canReserveCost(amountUsd: number, hardCapUsd: number): boolean {
  return canReserve('recurring', 0, amountUsd, hardCapUsd);
}
export function forecast(input: ForecastInput): Readonly<{ factor: number; adjusted: number; confidence: 'low' | 'medium' | 'high' }> {
  const raw = input.expectedCompleted > 0 ? input.actualCompleted / input.expectedCompleted : 1;
  const weight = Math.min(input.completedCalls / 20, 0.7);
  const trailing = input.trailingFactor ?? 1;
  const factor = Math.min(3, Math.max(0.5, raw * weight + trailing * (0.8 - weight) + 0.2));
  return { factor, adjusted: input.actualCompleted + input.remainingRecurring * factor, confidence: input.completedCalls >= 20 ? 'high' : input.completedCalls >= 5 ? 'medium' : 'low' };
}
export function cacheKey(manager: string, workflow: string, promptVersion: number, model: ModelId): string {
  return `${manager}:${workflow}:v${promptVersion}:${model}`;
}
export function redactUntrustedSource(value: string): string {
  return `<untrusted_source>${value.replaceAll('</untrusted_source>', '')}</untrusted_source>`;
}
export type RuntimeRequest = Readonly<{ model: ModelId; input: string; schema: Record<string, unknown>; background: boolean; cacheKey: string }>;
export interface ResponsesTransport { create(request: RuntimeRequest): Promise<{ id: string; outputText: string }>; retrieve(id: string): Promise<{ id: string; outputText: string; complete: boolean }>; }
export class ResponsesRuntime {
  constructor(private readonly transport: ResponsesTransport) {}
  async create(request: RuntimeRequest) { return this.transport.create(request); }
  async poll(id: string, maximumAttempts = 3) {
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      const response = await this.transport.retrieve(id);
      if (response.complete) return response;
    }
    throw new Error('background_response_timeout');
  }
}
