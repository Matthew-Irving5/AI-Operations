import { expect, it } from 'vitest';
import type { ManagerCode } from '@ai-operations/contracts';
import { OperationsManagerRegistry, ManagerRegistryError, requiredManagerCodes } from './registry';
import type { OperationsManager } from './index';
import { SyntheticSystemsManager } from './index';

function managerFor(code: ManagerCode): OperationsManager {
  if (code === 'systems') return new SyntheticSystemsManager();
  return {
    code,
    getWorkflowDefinitions: () => [],
    collect: async () => ({ valid: true, reasons: [] }),
    validateInputs: async () => ({ valid: true, reasons: [] }),
    buildContext: async () => ({}),
    execute: async () => ({ summary: 'ok', evidenceIds: ['evidence-1'] }),
    validateOutput: async () => ({ valid: true, reasons: [] }),
    proposeActions: async () => [],
    renderReport: async () => ({ title: 'Report', markdown: 'ok' }),
    determineNotifications: async () => [],
  };
}

it('requires all eight manager implementations and one contract per manager', () => {
  const complete = requiredManagerCodes.map(managerFor);
  const registry = new OperationsManagerRegistry(complete);
  expect(requiredManagerCodes.map((code) => registry.resolve(code).code)).toEqual(
    requiredManagerCodes,
  );
  expect(() => new OperationsManagerRegistry(complete.slice(1))).toThrow(
    'manager_registry_incomplete:finance',
  );
  expect(() => new OperationsManagerRegistry([...complete, complete[0]!])).toThrow(
    'manager_duplicate:finance',
  );
});

it('fails loudly when a manager does not implement a required capability or workflow', () => {
  const complete = requiredManagerCodes.map(managerFor);
  const missingCapability: OperationsManager = {
    ...complete[0]!,
    collect: undefined as unknown as OperationsManager['collect'],
  };
  expect(() => new OperationsManagerRegistry([missingCapability, ...complete.slice(1)])).toThrow(
    new ManagerRegistryError('manager_capability_missing:collect'),
  );

  const registry = new OperationsManagerRegistry(complete);
  expect(() => registry.resolveWorkflow('finance', 'missing-workflow', 1)).toThrow(
    'workflow_capability_missing:finance:missing-workflow:v1',
  );
});
