export type SystemsWorkflowCode = 'systems-daily-cost-capacity' | 'systems-weekly-quality-platform';

export type SystemsModelRoute = 'gpt-5.6-luna' | 'gpt-5.6-terra';

export function systemsLaunchRequest({
  workflowCode,
  hardCapUsd,
  modelCeiling,
  idempotencyKey,
}: {
  workflowCode: SystemsWorkflowCode;
  hardCapUsd: number;
  modelCeiling: SystemsModelRoute;
  idempotencyKey: string;
}) {
  return {
    workflowCode,
    managerCode: 'systems' as const,
    hardCapUsd,
    modelCeiling,
    searchCeiling: 0 as const,
    idempotencyKey,
    request: {},
  };
}
