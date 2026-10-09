import { z } from 'zod';
export * from './agents.ts';
export * from './conversations.ts';
export * from './evidence.ts';
export * from './execution.ts';

export const capabilitySchema = z.enum([
  'view_sensitive_data',
  'configure_managers',
  'change_budget',
  'launch_on_demand_run',
  'approve_local_plan',
  'export_data',
  'manage_connections',
  'manage_devices',
]);
export const actionRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  actionType: z.string().min(1).max(100),
  targetId: z.string().uuid(),
  reason: z.string().max(1000),
});
export const budgetCategorySchema = z.enum(['recurring', 'on_demand']);
export const aiOutputSchema = z
  .object({
    summary: z.string().min(1),
    findings: z.array(
      z
        .object({ claim: z.string().min(1), evidenceIds: z.array(z.string().min(1)).min(1) })
        .strict(),
    ),
    recommendations: z.array(z.string()),
    actions: z.array(
      z
        .object({
          type: z.string().min(1),
          title: z.string().min(1),
          risk: z.enum(['low', 'medium', 'high', 'critical']),
        })
        .strict(),
    ),
    alerts: z.array(z.string()),
    evidence: z.array(z.object({ id: z.string().min(1), source: z.string().min(1) }).strict()),
    uncertainties: z.array(z.string()),
    report_sections: z.array(
      z.object({ code: z.string().min(1), title: z.string().min(1), content: z.string() }).strict(),
    ),
  })
  .strict();
export type AiOutput = z.infer<typeof aiOutputSchema>;
export const notificationRequestSchema = z.object({
  type: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  dedupeKey: z.string().min(8).max(200),
  correlationId: z.string().uuid(),
});
