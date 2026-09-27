import { z } from 'zod';
import { stagingTarget } from './live-e2e-safety';

export const aal2ProbeRequestSchema = z.object({}).strict();

const edgeResponseSchema = z.object({ code: z.string().min(1).max(80) });

export function isStagingAal2ProbeTarget(
  requestOrigin: string | null,
  configuredAppOrigin: string | undefined,
  configuredSupabaseUrl: string | undefined,
): boolean {
  return (
    requestOrigin === stagingTarget.origin &&
    configuredAppOrigin === stagingTarget.origin &&
    configuredSupabaseUrl === stagingTarget.supabaseUrl
  );
}

export function parseAal2ProbeEdgeResponse(status: number, body: unknown) {
  const parsed = edgeResponseSchema.safeParse(body);
  return {
    status,
    code: parsed.success ? parsed.data.code : 'invalid_edge_response',
  };
}
