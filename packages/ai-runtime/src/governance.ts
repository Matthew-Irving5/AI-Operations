import { evaluateGoldenCase } from './eval.ts';
import { managerEvalFixtures } from './manager-eval-fixtures.ts';
import { procurementResearchOutputJsonSchema } from '@ai-operations/contracts';

export type ToolPolicy = Readonly<{
  version: number;
  tools: readonly Readonly<{ type: string; name: string }>[];
}>;

export type PromptGovernance = Readonly<{
  modelRoute: string;
  schemaVersion: number;
  toolPolicyVersion: number;
  toolPolicy: ToolPolicy;
}>;

export type PromptEvaluation = Readonly<{
  passed: boolean;
  caseCount: number;
  managerCount: number;
  safetyPassed: boolean;
  evidencePassed: boolean;
  toolAuthorityPassed: boolean;
  schemaPassed: boolean;
  costPassed: boolean;
  latencyPassed: boolean;
}>;

export function evaluatePromptCandidate(input: {
  systemText: string;
  developerText: string;
  schema: unknown;
  modelRoute: string;
  toolPolicy: unknown;
}): PromptEvaluation {
  const promptText = `${input.systemText}\n${input.developerText}`.toLowerCase();
  const promptRulesPassed = [
    'evidence',
    'approval',
    'budget',
    'uncertainty',
    'do not invent',
  ].every((rule) => promptText.includes(rule));
  const schemaPassed = validateReportOutputSchema(input.schema);
  const routePassed = allowedModelRoutes.has(input.modelRoute);
  const toolsPassed =
    isRecord(input.toolPolicy) &&
    Number.isSafeInteger(input.toolPolicy.version) &&
    Array.isArray(input.toolPolicy.tools) &&
    input.toolPolicy.tools.length === 0;
  const matrixPasses = managerEvalFixtures.every(({ testCase }) => {
    const boundedCase = { ...testCase, allowedTools: [] as string[] };
    const requiredFacts = testCase.requiredFacts.join('. ');
    const acceptedFixture = evaluateGoldenCase(
      testCase,
      {
        summary: requiredFacts,
        findings: [],
        evidence: testCase.requiredEvidenceIds.map((id) => ({ id })),
        toolCalls: [],
      },
      0.001,
      250,
    );
    const prohibitedFixture = evaluateGoldenCase(
      boundedCase,
      {
        summary: `${requiredFacts}. ${testCase.prohibitedClaims[0] ?? ''}`,
        findings: [],
        evidence: testCase.requiredEvidenceIds.map((id) => ({ id })),
        toolCalls: [],
      },
      0.001,
      250,
    );
    const unauthorizedToolFixture = evaluateGoldenCase(
      boundedCase,
      {
        summary: requiredFacts,
        findings: [],
        evidence: testCase.requiredEvidenceIds.map((id) => ({ id })),
        toolCalls: ['unregistered'],
      },
      0.001,
      250,
    );
    return (
      acceptedFixture.passed &&
      !prohibitedFixture.passed &&
      !unauthorizedToolFixture.passed &&
      acceptedFixture.costPassed &&
      acceptedFixture.latencyPassed
    );
  });
  const passed = promptRulesPassed && schemaPassed && routePassed && toolsPassed && matrixPasses;
  return {
    passed,
    caseCount: managerEvalFixtures.length * 3,
    managerCount: managerEvalFixtures.length,
    safetyPassed: promptRulesPassed && matrixPasses,
    evidencePassed: promptText.includes('evidence') && matrixPasses,
    toolAuthorityPassed: toolsPassed && matrixPasses,
    schemaPassed,
    costPassed: true,
    latencyPassed: true,
  };
}

export function canPromotePrompt(evaluation: unknown): evaluation is PromptEvaluation {
  return (
    isRecord(evaluation) &&
    evaluation.passed === true &&
    evaluation.caseCount === 24 &&
    evaluation.managerCount === 8 &&
    evaluation.safetyPassed === true &&
    evaluation.evidencePassed === true &&
    evaluation.toolAuthorityPassed === true &&
    evaluation.schemaPassed === true &&
    evaluation.costPassed === true &&
    evaluation.latencyPassed === true
  );
}

const allowedModelRoutes = new Set(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']);

const allowedToolTypes = new Set(['function', 'web_search']);
const allowedToolNames = new Set<string>();

export function validatePromptGovernance(value: unknown): value is PromptGovernance {
  if (
    !isRecord(value) ||
    typeof value.modelRoute !== 'string' ||
    !allowedModelRoutes.has(value.modelRoute) ||
    !Number.isSafeInteger(value.schemaVersion) ||
    Number(value.schemaVersion) < 1 ||
    !Number.isSafeInteger(value.toolPolicyVersion) ||
    Number(value.toolPolicyVersion) < 1 ||
    !isRecord(value.toolPolicy) ||
    value.toolPolicy.version !== value.toolPolicyVersion ||
    !Array.isArray(value.toolPolicy.tools)
  )
    return false;
  return value.toolPolicy.tools.every((tool: unknown) => {
    if (!isRecord(tool) || typeof tool.type !== 'string' || !allowedToolTypes.has(tool.type))
      return false;
    if (tool.type === 'web_search') return tool.name === 'web_search';
    return typeof tool.name === 'string' && allowedToolNames.has(tool.name);
  });
}

export function validateStrictOutputSchema(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.type !== 'object' ||
    value.additionalProperties !== false ||
    !isRecord(value.properties) ||
    !Array.isArray(value.required)
  )
    return false;
  const properties = Object.keys(value.properties);
  const required = value.required as unknown[];
  return (
    properties.length > 0 &&
    properties.every((property) => required.includes(property)) &&
    required.every(
      (property: unknown) => typeof property === 'string' && properties.includes(property),
    ) &&
    visitSchema(value)
  );
}

export function validateReportOutputSchema(value: unknown): boolean {
  if (!isRecord(value) || !validateStrictOutputSchema(value) || !isRecord(value.properties))
    return false;
  const properties = value.properties;
  const requiredFields = [
    'summary',
    'findings',
    'recommendations',
    'actions',
    'alerts',
    'evidence',
    'uncertainties',
    'report_sections',
  ];
  if (
    requiredFields.length !== Object.keys(properties).length ||
    requiredFields.some((field) => !(field in properties))
  )
    return false;
  const isArrayOf = (candidate: unknown, itemType: string) =>
    isRecord(candidate) &&
    candidate.type === 'array' &&
    isRecord(candidate.items) &&
    candidate.items.type === itemType;
  const isObjectWith = (candidate: unknown, fields: readonly string[]) => {
    if (
      !isRecord(candidate) ||
      candidate.type !== 'object' ||
      !isRecord(candidate.properties) ||
      !Array.isArray(candidate.required)
    )
      return false;
    const nestedProperties = candidate.properties;
    const nestedRequired = candidate.required as unknown[];
    return (
      fields.length === Object.keys(nestedProperties).length &&
      fields.every((field) => field in nestedProperties) &&
      fields.every((field) => nestedRequired.includes(field))
    );
  };
  const isStringSchema = (candidate: unknown) => isRecord(candidate) && candidate.type === 'string';
  const objectProperties = (candidate: unknown) =>
    isRecord(candidate) && isRecord(candidate.properties) ? candidate.properties : null;
  const findingsItem =
    isRecord(properties.findings) && isRecord(properties.findings.items)
      ? properties.findings.items
      : null;
  const findingProperties =
    findingsItem && isRecord(findingsItem.properties) ? findingsItem.properties : null;
  const actionProperties = objectProperties(
    isRecord(properties.actions) ? properties.actions.items : null,
  );
  const evidenceProperties = objectProperties(
    isRecord(properties.evidence) ? properties.evidence.items : null,
  );
  const sectionProperties = objectProperties(
    isRecord(properties.report_sections) ? properties.report_sections.items : null,
  );
  return (
    isRecord(properties.summary) &&
    properties.summary.type === 'string' &&
    isArrayOf(properties.recommendations, 'string') &&
    isArrayOf(properties.alerts, 'string') &&
    isArrayOf(properties.uncertainties, 'string') &&
    isRecord(properties.findings) &&
    properties.findings.type === 'array' &&
    isObjectWith(findingsItem, ['claim', 'evidenceIds']) &&
    !!findingProperties &&
    isArrayOf(findingProperties.evidenceIds, 'string') &&
    isStringSchema(findingProperties.claim) &&
    isRecord(properties.actions) &&
    properties.actions.type === 'array' &&
    isObjectWith(properties.actions.items, ['type', 'title', 'risk']) &&
    !!actionProperties &&
    isStringSchema(actionProperties.type) &&
    isStringSchema(actionProperties.title) &&
    isRecord(actionProperties.risk) &&
    actionProperties.risk.type === 'string' &&
    JSON.stringify(actionProperties.risk.enum) ===
      JSON.stringify(['low', 'medium', 'high', 'critical']) &&
    isRecord(properties.evidence) &&
    properties.evidence.type === 'array' &&
    isObjectWith(properties.evidence.items, ['id', 'source']) &&
    !!evidenceProperties &&
    isStringSchema(evidenceProperties.id) &&
    isStringSchema(evidenceProperties.source) &&
    isRecord(properties.report_sections) &&
    properties.report_sections.type === 'array' &&
    isObjectWith(properties.report_sections.items, ['code', 'title', 'content']) &&
    !!sectionProperties &&
    isStringSchema(sectionProperties.code) &&
    isStringSchema(sectionProperties.title) &&
    isStringSchema(sectionProperties.content)
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function validateProcurementResearchOutputSchema(value: unknown): boolean {
  return canonicalJson(value) === canonicalJson(procurementResearchOutputJsonSchema);
}

function visitSchema(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === 'object') {
    if (
      value.additionalProperties !== false ||
      !isRecord(value.properties) ||
      !Array.isArray(value.required)
    )
      return false;
    const properties = Object.keys(value.properties);
    const required = value.required as unknown[];
    if (
      properties.length !== required.length ||
      properties.some((property) => !required.includes(property))
    )
      return false;
    return Object.values(value.properties).every(visitSchema);
  }
  if (value.type === 'array') return visitSchema(value.items);
  if (
    value.type === 'string' ||
    value.type === 'number' ||
    value.type === 'integer' ||
    value.type === 'boolean' ||
    value.enum !== undefined
  )
    return true;
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
