import type { ManagerCode } from '@ai-operations/contracts';
import type { OperationsManager, WorkflowDefinition } from './index';

export const requiredManagerCodes = [
  'finance',
  'career',
  'personal',
  'health',
  'systems',
  'digital_estate',
  'travel',
  'procurement',
] as const satisfies readonly ManagerCode[];

const requiredMethods = [
  'getWorkflowDefinitions',
  'collect',
  'validateInputs',
  'buildContext',
  'execute',
  'validateOutput',
  'proposeActions',
  'renderReport',
  'determineNotifications',
] as const;

export class ManagerRegistryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ManagerRegistryError';
  }
}

function assertManagerContract(value: OperationsManager): void {
  if (!value || typeof value !== 'object' || typeof value.code !== 'string') {
    throw new ManagerRegistryError('manager_contract_invalid');
  }
  for (const method of requiredMethods) {
    if (typeof value[method] !== 'function') {
      throw new ManagerRegistryError(`manager_capability_missing:${method}`);
    }
  }
}

export class OperationsManagerRegistry {
  readonly #managers: ReadonlyMap<ManagerCode, OperationsManager>;

  constructor(managers: readonly OperationsManager[]) {
    const registered = new Map<ManagerCode, OperationsManager>();
    for (const manager of managers) {
      assertManagerContract(manager);
      if (registered.has(manager.code)) {
        throw new ManagerRegistryError(`manager_duplicate:${manager.code}`);
      }
      registered.set(manager.code, manager);
    }
    const missing = requiredManagerCodes.filter((code) => !registered.has(code));
    if (missing.length > 0) {
      throw new ManagerRegistryError(`manager_registry_incomplete:${missing.join(',')}`);
    }
    this.#managers = registered;
  }

  resolve(code: ManagerCode): OperationsManager {
    const manager = this.#managers.get(code);
    if (!manager) throw new ManagerRegistryError(`manager_capability_missing:${code}`);
    return manager;
  }

  resolveWorkflow(code: ManagerCode, workflowCode: string, version: number): WorkflowDefinition {
    const matches = this.resolve(code)
      .getWorkflowDefinitions()
      .filter((workflow) => workflow.code === workflowCode && workflow.version === version);
    if (matches.length !== 1) {
      throw new ManagerRegistryError(
        matches.length === 0
          ? `workflow_capability_missing:${code}:${workflowCode}:v${version}`
          : `workflow_definition_duplicate:${code}:${workflowCode}:v${version}`,
      );
    }
    const workflow = matches[0];
    if (!workflow) throw new ManagerRegistryError('workflow_registry_invalid');
    return workflow;
  }
}
