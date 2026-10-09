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

export const managerRiskClassSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const managerCapabilityCodeSchema = z.enum([
  'canonical_conversation_content',
  'gmail_conversation_transport',
  'web_chat_response_transport',
  'own_domain_state',
  'other_domain_state',
  'planner_attention_queue',
  'inter_agent_requests',
  'execution_request_queue',
  'calendar_read',
  'calendar_write',
  'reminder_read',
  'reminder_write',
  'google_drive_read',
  'google_drive_write',
  'apple_health_read',
  'finance_history_research',
  'web_research',
  'personal_github',
  'windows_worker_inventory',
  'windows_worker_mutation',
  'isolated_frontier_sandbox',
  'financial_execution',
  'travel_booking',
  'product_purchase',
  'prompt_model_config',
  'cost_reservations',
  'audit_trace_append',
  'immediate_notification',
  'routine_user_briefing',
]);

export const managerPermissionSchema = z.enum(['read', 'write', 'execute', 'research', 'enqueue']);

export const managerIdentitySchema = z
  .object({
    contractVersion: z.literal(1),
    code: managerCodeSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1000),
    enabled: z.boolean(),
    riskClass: managerRiskClassSchema,
  })
  .strict();

export const managerCapabilitySchema = z
  .object({
    contractVersion: z.literal(1),
    managerCode: managerCodeSchema,
    capability: managerCapabilityCodeSchema,
    permissions: z.array(managerPermissionSchema).min(1).max(5),
  })
  .strict()
  .superRefine((capability, context) => {
    if (new Set(capability.permissions).size !== capability.permissions.length) {
      context.addIssue({
        code: 'custom',
        message: 'manager_permissions_must_be_unique',
        path: ['permissions'],
      });
    }
  });

export type ManagerCode = z.infer<typeof managerCodeSchema>;
export type ManagerRiskClass = z.infer<typeof managerRiskClassSchema>;
export type ManagerCapabilityCode = z.infer<typeof managerCapabilityCodeSchema>;
export type ManagerPermission = z.infer<typeof managerPermissionSchema>;
export type ManagerIdentity = z.infer<typeof managerIdentitySchema>;
export type ManagerCapability = z.infer<typeof managerCapabilitySchema>;
