import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const ShaSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/i)
  .transform((value) => value.toLowerCase());
const SafeIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_:-]{0,127}$/);
const DecimalUsdSchema = z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/);
const PassedCostMatrixSchema = z
  .object({
    estimateReservationReconciliation: z.literal('passed'),
    hardCapConcurrency: z.literal('passed'),
    cancellationFailureRelease: z.literal('passed'),
    staleUnknownPricing: z.literal('passed'),
    forecastInputsConfidence: z.literal('passed'),
    providerDiscrepancy: z.literal('passed'),
    nestedManagerAttribution: z.literal('passed'),
  })
  .strict();

export const Ai20CostRuntimeProofSchema = z
  .object({
    localProofSha: ShaSchema,
    localMatrix: PassedCostMatrixSchema,
    workflowCode: z.literal('systems-weekly-quality-platform'),
    requestScope: z.literal('empty'),
    provider: z.literal('openai-responses'),
    providerCallCount: z.literal(1),
    searchCalls: z.literal(0),
    toolCalls: z.literal(0),
    actionsExecuted: z.literal(0),
    model: z.literal('gpt-5.6-luna'),
    runId: z.string().uuid(),
    responseId: SafeIdSchema,
    correlationId: z.string().uuid(),
    aiCallId: z.string().uuid(),
    reservationId: z.string().uuid(),
    pricingRecordId: z.string().uuid(),
    estimatedUsd: DecimalUsdSchema,
    reservedUsd: DecimalUsdSchema,
    hardCapUsd: z.literal('0.05'),
    calculatedActualUsd: DecimalUsdSchema,
    reservationConsumedUsd: DecimalUsdSchema,
    reservationReleasedUsd: DecimalUsdSchema,
    onDemandReservedAfterUsd: DecimalUsdSchema,
    onDemandActualUsd: DecimalUsdSchema,
    reservationState: z.literal('consumed'),
    providerUsage: z
      .object({
        inputTokens: z.number().int().positive(),
        cachedInputTokens: z.number().int().nonnegative(),
        cacheWriteTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().positive(),
        reasoningTokens: z.number().int().nonnegative(),
      })
      .strict(),
    pricingInputs: z
      .object({
        inputPerMillion: DecimalUsdSchema,
        cachedInputPerMillion: DecimalUsdSchema,
        outputPerMillion: DecimalUsdSchema,
        cacheWriteMultiplier: DecimalUsdSchema,
        webSearchPerCall: DecimalUsdSchema,
      })
      .strict(),
    usageReconciliation: z.literal('passed'),
    costReconciliation: z.literal('passed'),
    traceReconciliation: z.literal('passed'),
  })
  .strict()
  .superRefine((proof, context) => {
    const estimate = usdToE8(proof.estimatedUsd);
    const reserve = usdToE8(proof.reservedUsd);
    const cap = usdToE8(proof.hardCapUsd);
    const actual = usdToE8(proof.calculatedActualUsd);
    const consumed = usdToE8(proof.reservationConsumedUsd);
    const released = usdToE8(proof.reservationReleasedUsd);
    const onDemandReserved = usdToE8(proof.onDemandReservedAfterUsd);
    const onDemandActual = usdToE8(proof.onDemandActualUsd);
    if (
      estimate <= 0n ||
      reserve <= 0n ||
      actual <= 0n ||
      estimate > reserve ||
      reserve > cap ||
      actual > cap ||
      consumed !== actual ||
      released !== (reserve > actual ? reserve - actual : 0n) ||
      onDemandReserved !== 0n ||
      onDemandActual !== actual
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cost reservation and on-demand settlement evidence is inconsistent',
      });
    }
    if (
      proof.providerUsage.cachedInputTokens + proof.providerUsage.cacheWriteTokens >
      proof.providerUsage.inputTokens
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cached and cache-write tokens exceed total input tokens',
      });
    }
    const calculated = calculateActualCostUsd(
      proof.providerUsage,
      proof.pricingInputs,
      proof.searchCalls,
    );
    if (usdToE8(proof.calculatedActualUsd) !== usdToE8(calculated)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'calculated actual cost does not match the recorded usage and price',
      });
    }
  });

export const Ai20CostRuntimeEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('COST_RUNTIME_STAGING_ACCEPTED'),
    acceptanceProfile: z.literal('cost-runtime'),
    candidateSha: ShaSchema,
    candidateTreeSha: ShaSchema,
    pullRequestNumber: z.number().int().positive(),
    deploymentRunId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    stagingOrigin: z.literal('https://ai-operations-staging.ai-operations.workers.dev'),
    humanMfa: z.literal('user-completed').optional(),
    checks: z
      .object({
        localCostMatrix: z.literal('passed'),
        oneBoundedProviderCall: z.literal('passed'),
      })
      .strict(),
    costRuntimeProof: Ai20CostRuntimeProofSchema,
    correlationIds: z.array(SafeIdSchema).length(1),
    acceptedAt: z.string().datetime({ offset: true }),
    accepted: z.literal(true),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.costRuntimeProof.localProofSha !== evidence.candidateSha) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'local cost proof SHA does not match the hosted candidate SHA',
      });
    }
    if (evidence.correlationIds[0] !== evidence.costRuntimeProof.correlationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'hosted correlation ID does not match the cost runtime proof',
      });
    }
  });

export type Ai20CostRuntimeProof = z.infer<typeof Ai20CostRuntimeProofSchema>;
export type Ai20CostRuntimeEvidence = z.infer<typeof Ai20CostRuntimeEvidenceSchema>;

export function createAi20CostRuntimeProof(input: unknown): Ai20CostRuntimeEvidence {
  return Ai20CostRuntimeEvidenceSchema.parse(input);
}

export function calculateActualCostUsd(
  usage: Ai20CostRuntimeProof['providerUsage'],
  pricing: Ai20CostRuntimeProof['pricingInputs'],
  searchCalls = 0,
): string {
  const scale = 100_000_000n;
  const scaleSquared = scale * scale;
  const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens;
  const rawMicroUsdScaled =
    BigInt(uncachedInputTokens) * usdToE8(pricing.inputPerMillion) * scale +
    BigInt(usage.cachedInputTokens) * usdToE8(pricing.cachedInputPerMillion) * scale +
    BigInt(usage.outputTokens) * usdToE8(pricing.outputPerMillion) * scale +
    BigInt(usage.cacheWriteTokens) *
      usdToE8(pricing.inputPerMillion) *
      usdToE8(pricing.cacheWriteMultiplier) +
    BigInt(searchCalls) * usdToE8(pricing.webSearchPerCall) * scale * 1_000_000n;
  const micros = (rawMicroUsdScaled + scaleSquared - 1n) / scaleSquared;
  const whole = micros / 1_000_000n;
  const fractional = String(micros % 1_000_000n).padStart(6, '0');
  return `${whole}.${fractional}`;
}

export async function writeAi20CostRuntimeProof(path: string, input: unknown): Promise<void> {
  const proof = createAi20CostRuntimeProof(input);
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(proof, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function usdToE8(value: string): bigint {
  const [whole = '0', fractional = ''] = value.split('.');
  return BigInt(whole) * 100_000_000n + BigInt(fractional.padEnd(8, '0') || '0');
}
