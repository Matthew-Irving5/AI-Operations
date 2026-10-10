import type { ActionProposal } from '@ai-operations/contracts';
import type {
  ManagerOutput,
  NotificationRequest,
  OperationsManager,
  Report,
  RunContext,
  ValidationResult,
} from './index';

export const deterministicWorkflowStages = [
  'collect',
  'validate_inputs',
  'build_context',
  'execute',
  'validate_output',
  'propose_actions',
  'render_report',
  'determine_notifications',
  'persist_evidence',
] as const;

export type DeterministicWorkflowStage = (typeof deterministicWorkflowStages)[number];
export type WorkflowStageStatus = 'running' | 'succeeded' | 'failed';

export type WorkflowStageRecord = Readonly<{
  runId: string;
  sequence: number;
  stage: DeterministicWorkflowStage;
  status: WorkflowStageStatus;
  startedAt: string;
  completedAt: string | null;
}>;

export type DeterministicWorkflowResult = Readonly<{
  output: ManagerOutput;
  actions: readonly ActionProposal[];
  report: Report;
  notifications: readonly NotificationRequest[];
}>;

export type DeterministicWorkflowOutcome =
  | Readonly<{ outcome: 'succeeded'; result: DeterministicWorkflowResult }>
  | Readonly<{ outcome: 'retryable_failure' | 'terminal_failure'; errorCode: string }>;

export interface DeterministicWorkflowPersistence {
  recordStage(record: WorkflowStageRecord): Promise<void>;
  persistEvidence(runId: string, evidenceIds: readonly string[]): Promise<void>;
}

export class WorkflowStageFailure extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = 'WorkflowStageFailure';
  }
}

function requireValid(result: ValidationResult, code: string): void {
  if (!result.valid) throw new WorkflowStageFailure(code);
}

function failureCode(error: unknown): string {
  return error instanceof WorkflowStageFailure ? error.code : 'workflow_stage_failed';
}

export async function executeDeterministicWorkflow(
  input: Readonly<{
    manager: OperationsManager;
    context: RunContext;
    persistence: DeterministicWorkflowPersistence;
    now?: () => string;
  }>,
): Promise<DeterministicWorkflowOutcome> {
  const now = input.now ?? (() => new Date().toISOString());
  let sequence = 0;

  const stage = async <T>(
    stageCode: DeterministicWorkflowStage,
    execute: () => Promise<T>,
  ): Promise<T> => {
    sequence += 1;
    const startedAt = now();
    const base = {
      runId: input.context.runId,
      sequence,
      stage: stageCode,
      startedAt,
    } as const;
    await input.persistence.recordStage({ ...base, status: 'running', completedAt: null });
    try {
      const result = await execute();
      await input.persistence.recordStage({
        ...base,
        status: 'succeeded',
        completedAt: now(),
      });
      return result;
    } catch (error) {
      await input.persistence.recordStage({
        ...base,
        status: 'failed',
        completedAt: now(),
      });
      throw error;
    }
  };

  try {
    await stage('collect', async () => {
      requireValid(await input.manager.collect(input.context), 'collection_invalid');
    });
    await stage('validate_inputs', async () => {
      requireValid(await input.manager.validateInputs(input.context), 'workflow_input_invalid');
    });
    const context = await stage('build_context', () => input.manager.buildContext(input.context));
    const managerContext = { ...input.context, ...context };
    const output = await stage('execute', () => input.manager.execute(managerContext));
    await stage('validate_output', async () => {
      requireValid(await input.manager.validateOutput(output), 'workflow_output_invalid');
    });
    const actions = await stage('propose_actions', () => input.manager.proposeActions(output));
    const report = await stage('render_report', () => input.manager.renderReport(output));
    const notifications = await stage('determine_notifications', () =>
      input.manager.determineNotifications(report),
    );
    await stage('persist_evidence', async () =>
      input.persistence.persistEvidence(input.context.runId, output.evidenceIds),
    );
    return {
      outcome: 'succeeded',
      result: { output, actions, report, notifications },
    };
  } catch (error) {
    return {
      outcome: error instanceof WorkflowStageFailure ? 'terminal_failure' : 'retryable_failure',
      errorCode: failureCode(error),
    };
  }
}
