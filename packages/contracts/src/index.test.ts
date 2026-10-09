import { describe, expect, it } from 'vitest';
import {
  managerCapabilitySchema,
  managerCodeSchema,
  managerIdentitySchema,
  aiOutputSchema,
} from './index';
describe('manager contracts', () => {
  it('accepts only stable manager codes', () => {
    expect(managerCodeSchema.safeParse('finance').success).toBe(true);
    expect(managerCodeSchema.safeParse('unknown').success).toBe(false);
  });

  it('validates versioned manager identity and capability contracts', () => {
    expect(
      managerIdentitySchema.safeParse({
        contractVersion: 1,
        code: 'personal',
        name: 'Personal Operations / Planner / Executive Assistant',
        description: 'Coordinates day-to-day planning and communication.',
        enabled: true,
        riskClass: 'medium',
      }).success,
    ).toBe(true);
    expect(
      managerCapabilitySchema.safeParse({
        contractVersion: 1,
        managerCode: 'personal',
        capability: 'calendar_write',
        permissions: ['write', 'execute'],
      }).success,
    ).toBe(true);
    expect(
      managerCapabilitySchema.safeParse({
        contractVersion: 1,
        managerCode: 'personal',
        capability: 'financial_execution',
        permissions: ['execute', 'execute'],
      }).success,
    ).toBe(false);
    expect(
      managerCapabilitySchema.safeParse({
        contractVersion: 1,
        managerCode: 'personal',
        capability: 'calendar_write',
        permissions: [],
      }).success,
    ).toBe(false);
  });

  it('rejects unstructured fields at the shared AI output boundary', () => {
    const output = {
      summary: 'Summary',
      findings: [{ claim: 'Finding', evidenceIds: ['evidence-1'] }],
      recommendations: [],
      actions: [],
      alerts: [],
      evidence: [{ id: 'evidence-1', source: 'source document' }],
      uncertainties: [],
      report_sections: [],
    };
    expect(aiOutputSchema.safeParse(output).success).toBe(true);
    expect(aiOutputSchema.safeParse({ ...output, unauthorized: true }).success).toBe(false);
  });
});
