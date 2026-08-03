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

export type PlanningEvent = Readonly<{
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}>;
export type PlanningReminder = Readonly<{
  id: string;
  title: string;
  dueAt: string | null;
  priority: number;
  completed: boolean;
}>;
export type PersonalPlanningInput = Readonly<{
  now: string;
  events: readonly PlanningEvent[];
  reminders: readonly PlanningReminder[];
  minimumBufferMinutes: number;
}>;
export type PersonalPlanningResult = Readonly<{
  conflicts: readonly string[];
  rankedReminderIds: readonly string[];
  materialChange: boolean;
}>;

export function planPersonalDay(input: PersonalPlanningInput): PersonalPlanningResult {
  const orderedEvents = [...input.events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const conflicts: string[] = [];
  for (let index = 1; index < orderedEvents.length; index += 1) {
    const previous = orderedEvents[index - 1];
    const current = orderedEvents[index];
    if (!previous || !current) continue;
    const requiredStart = new Date(previous.endsAt).getTime() + input.minimumBufferMinutes * 60_000;
    if (new Date(current.startsAt).getTime() < requiredStart) conflicts.push(current.id);
  }
  const now = new Date(input.now).getTime();
  const rankedReminderIds = input.reminders
    .filter((reminder) => !reminder.completed)
    .sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const aUrgency = (aDue <= now ? 10 : 0) + a.priority;
      const bUrgency = (bDue <= now ? 10 : 0) + b.priority;
      return bUrgency - aUrgency || aDue - bDue || a.id.localeCompare(b.id);
    })
    .map((reminder) => reminder.id);
  return {
    conflicts,
    rankedReminderIds,
    materialChange:
      conflicts.length > 0 ||
      input.reminders.some(
        (reminder) =>
          !reminder.completed &&
          reminder.dueAt !== null &&
          new Date(reminder.dueAt).getTime() <= now,
      ),
  };
}

export const personalWorkflows: readonly WorkflowDefinition[] = [
  {
    code: 'personal-morning-plan',
    version: 1,
    model: 'gpt-5.6-luna',
    priority: 1,
    notificationPolicy: 'report',
    allowedActionTypes: [],
  },
  {
    code: 'personal-midday-exception',
    version: 1,
    model: 'gpt-5.6-luna',
    priority: 1,
    notificationPolicy: 'exception',
    allowedActionTypes: [],
  },
  {
    code: 'personal-evening-close',
    version: 1,
    model: 'gpt-5.6-luna',
    priority: 2,
    notificationPolicy: 'report',
    allowedActionTypes: [],
  },
  {
    code: 'personal-weekly-plan',
    version: 1,
    model: 'gpt-5.6-terra',
    priority: 2,
    notificationPolicy: 'report',
    allowedActionTypes: [],
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
