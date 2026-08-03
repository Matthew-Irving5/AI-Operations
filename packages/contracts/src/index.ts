import { z } from 'zod';
export const managerCodeSchema = z.enum([
  'finance',
  'career',
  'personal',
  'health',
  'systems',
  'digital_estate',
  'travel',
  'procurement',
]);
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
export type ManagerCode = z.infer<typeof managerCodeSchema>;

export const budgetCategorySchema = z.enum(['recurring', 'on_demand']);
export const aiOutputSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(z.object({ claim: z.string(), evidenceIds: z.array(z.string()).min(1) })),
  recommendations: z.array(z.string()),
  actions: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      risk: z.enum(['low', 'medium', 'high', 'critical']),
    }),
  ),
  alerts: z.array(z.string()),
  evidence: z.array(z.object({ id: z.string(), source: z.string() })),
  uncertainties: z.array(z.string()),
  report_sections: z.array(z.object({ code: z.string(), title: z.string(), content: z.string() })),
});
export type AiOutput = z.infer<typeof aiOutputSchema>;
export const notificationRequestSchema = z.object({
  type: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  dedupeKey: z.string().min(8).max(200),
  correlationId: z.string().uuid(),
});
