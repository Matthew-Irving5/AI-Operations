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
