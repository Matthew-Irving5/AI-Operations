export type ManagerCode =
  | 'finance'
  | 'career'
  | 'personal'
  | 'health'
  | 'systems'
  | 'digital_estate'
  | 'travel'
  | 'procurement';

export type WorkflowDefinition = Readonly<{
  code: string;
  version: number;
  model: 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol';
  priority: 0 | 1 | 2 | 3 | 4;
  notificationPolicy: 'silent' | 'report' | 'exception';
  allowedActionTypes: readonly string[];
}>;
export type RunContext = Readonly<{ runId: string; correlationId: string; timezone: string }>;
export type ValidationResult = Readonly<{ valid: boolean; reasons: readonly string[] }>;
export type ManagerOutput = Readonly<{ summary: string; evidenceIds: readonly string[] }>;
export type ActionProposal = Readonly<{
  type: string;
  title: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
}>;
export type Report = Readonly<{ title: string; markdown: string }>;
export type NotificationRequest = Readonly<{ subject: string; body: string; dedupeKey: string }>;

export function requireIdempotencyKey(value: string): string {
  if (!/^[a-z0-9][a-z0-9:_-]{7,127}$/i.test(value)) throw new Error('invalid_idempotency_key');
  return value;
}

export interface OperationsManager {
  code: ManagerCode;
  getWorkflowDefinitions(): readonly WorkflowDefinition[];
  collect(context: RunContext): Promise<ValidationResult>;
  validateInputs(context: RunContext): Promise<ValidationResult>;
  buildContext(context: RunContext): Promise<Record<string, unknown>>;
  execute(context: RunContext): Promise<ManagerOutput>;
  validateOutput(output: ManagerOutput): Promise<ValidationResult>;
  proposeActions(output: ManagerOutput): Promise<readonly ActionProposal[]>;
  renderReport(output: ManagerOutput): Promise<Report>;
  determineNotifications(report: Report): Promise<readonly NotificationRequest[]>;
}

export const systemsWorkflows: readonly WorkflowDefinition[] = [
  {
    code: 'systems-daily-cost-capacity',
    version: 1,
    model: 'gpt-5.6-luna',
    priority: 1,
    notificationPolicy: 'exception',
    allowedActionTypes: [],
  },
  {
    code: 'systems-weekly-quality-platform',
    version: 1,
    model: 'gpt-5.6-terra',
    priority: 2,
    notificationPolicy: 'report',
    allowedActionTypes: ['review_prompt_promotion'],
  },
  {
    code: 'systems-monthly-cost-report',
    version: 1,
    model: 'gpt-5.6-terra',
    priority: 1,
    notificationPolicy: 'report',
    allowedActionTypes: ['review_budget_recommendation'],
  },
];

export class SyntheticSystemsManager implements OperationsManager {
  code: ManagerCode = 'systems';
  getWorkflowDefinitions() {
    return systemsWorkflows;
  }
  async collect() {
    return { valid: true, reasons: [] };
  }
  async validateInputs() {
    return { valid: true, reasons: [] };
  }
  async buildContext() {
    return { deterministic: true };
  }
  async execute() {
    return {
      summary: 'Synthetic platform health is within policy.',
      evidenceIds: ['synthetic-platform-health'],
    };
  }
  async validateOutput(output: ManagerOutput) {
    return {
      valid: output.evidenceIds.length > 0,
      reasons: output.evidenceIds.length ? [] : ['missing_evidence'],
    };
  }
  async proposeActions() {
    return [];
  }
  async renderReport(output: ManagerOutput) {
    return { title: 'Systems health', markdown: output.summary };
  }
  async determineNotifications() {
    return [];
  }
}
