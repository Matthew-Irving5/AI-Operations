import { expect, it } from 'vitest';
import {
  executeDeterministicWorkflow,
  type DeterministicWorkflowPersistence,
  type WorkflowStageRecord,
} from './orchestrator';
import { SyntheticSystemsManager, type OperationsManager } from './index';

it('runs and persists deterministic workflow stages in order without an AI dependency', async () => {
  const records: WorkflowStageRecord[] = [];
  const evidence: string[][] = [];
  const persistence: DeterministicWorkflowPersistence = {
    recordStage: async (record) => {
      records.push(record);
    },
    persistEvidence: async (_runId, ids) => {
      evidence.push([...ids]);
    },
  };
  let time = 0;
  const result = await executeDeterministicWorkflow({
    manager: new SyntheticSystemsManager(),
    context: {
      runId: 'run-1',
      correlationId: 'correlation-1',
      timezone: 'Europe/London',
    },
    persistence,
    now: () => `2026-10-09T12:00:${String(time++).padStart(2, '0')}.000Z`,
  });

  expect(
    records.filter((record) => record.status === 'running').map((record) => record.stage),
  ).toEqual([
    'collect',
    'validate_inputs',
    'build_context',
    'execute',
    'validate_output',
    'propose_actions',
    'render_report',
    'determine_notifications',
    'persist_evidence',
  ]);
  expect(records.filter((record) => record.status === 'succeeded')).toHaveLength(9);
  expect(evidence).toEqual([['synthetic-platform-health']]);
  expect(result.outcome).toBe('succeeded');
  if (result.outcome !== 'succeeded') throw new Error('expected_success');
  expect(result.result.report.title).toBe('Systems health');
  expect(result.result.notifications).toEqual([]);
});

it('stops before later stages and persists failure when collection validation fails', async () => {
  const records: WorkflowStageRecord[] = [];
  const manager: OperationsManager = new SyntheticSystemsManager();
  manager.collect = async () => ({ valid: false, reasons: ['source_unavailable'] });
  const persistence: DeterministicWorkflowPersistence = {
    recordStage: async (record) => {
      records.push(record);
    },
    persistEvidence: async () => {
      throw new Error('must_not_persist_evidence');
    },
  };

  const result = await executeDeterministicWorkflow({
    manager,
    context: { runId: 'run-2', correlationId: 'correlation-2', timezone: 'Europe/London' },
    persistence,
    now: () => '2026-10-09T12:00:00.000Z',
  });

  expect(records.map((record) => `${record.stage}:${record.status}`)).toEqual([
    'collect:running',
    'collect:failed',
  ]);
  expect(result).toEqual({ outcome: 'terminal_failure', errorCode: 'collection_invalid' });
});
