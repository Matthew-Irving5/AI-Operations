import { z } from 'zod';
import { createSupabaseServerClient } from './supabase-server';

const reportSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  summary: z.string(),
  status: z.string(),
  created_at: z.string(),
});
const approvalSchema = z.object({
  id: z.string().uuid(),
  decision: z.string(),
  required_aal: z.string(),
  expires_at: z.string(),
  actions: z.object({ title: z.string(), risk_class: z.string() }).nullable(),
});
const traceSchema = z.object({
  id: z.string().uuid(),
  correlation_id: z.string().uuid(),
  event_type: z.string(),
  severity: z.string(),
  created_at: z.string(),
});
const feedbackSchema = z.object({
  id: z.string().uuid(),
  positive: z.boolean(),
  categories: z.array(z.string()),
  status: z.string(),
  created_at: z.string(),
  reports: z.object({ title: z.string() }).nullable(),
});
const scheduleSchema = z.object({
  id: z.string().uuid(),
  cron_expression: z.string(),
  timezone: z.string(),
  next_due_at: z.string().nullable(),
  enabled: z.boolean(),
  workflow_definitions: z.object({ code: z.string() }).nullable(),
});
const forecastSchema = z.object({
  actual_spend: z.coerce.number(),
  expected_completed: z.coerce.number(),
  original_month_end: z.coerce.number(),
  adjusted_month_end: z.coerce.number(),
  confidence: z.string(),
});
const callSchema = z.object({
  id: z.string().uuid(),
  model_id: z.string(),
  actual_cost: z.coerce.number(),
  estimated_cost: z.coerce.number(),
  status: z.string(),
  created_at: z.string(),
});

export type PageData<T> = Readonly<{ data: T; error: string | null }>;

function parsedRows<T>(value: unknown, schema: z.ZodType<T[]>): PageData<T[]> {
  const result = schema.safeParse(value);
  return result.success
    ? { data: result.data, error: null }
    : { data: [], error: 'The platform returned an invalid response.' };
}

export async function reportsData(): Promise<PageData<z.infer<typeof reportSchema>[]>> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from('reports')
    .select('id,title,summary,status,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  return error
    ? { data: [], error: 'Reports could not be loaded.' }
    : parsedRows(data, z.array(reportSchema));
}

export async function approvalsData(): Promise<PageData<z.infer<typeof approvalSchema>[]>> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from('approvals')
    .select('id,decision,required_aal,expires_at,actions(title,risk_class)')
    .order('expires_at')
    .limit(50);
  return error
    ? { data: [], error: 'Approvals could not be loaded.' }
    : parsedRows(data, z.array(approvalSchema));
}

export async function tracesData(): Promise<PageData<z.infer<typeof traceSchema>[]>> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from('trace_events')
    .select('id,correlation_id,event_type,severity,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  return error
    ? { data: [], error: 'Traces could not be loaded.' }
    : parsedRows(data, z.array(traceSchema));
}

export async function feedbackData(): Promise<PageData<z.infer<typeof feedbackSchema>[]>> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from('feedback')
    .select('id,positive,categories,status,created_at,reports(title)')
    .order('created_at', { ascending: false })
    .limit(50);
  return error
    ? { data: [], error: 'Feedback could not be loaded.' }
    : parsedRows(data, z.array(feedbackSchema));
}

export async function schedulesData(): Promise<PageData<z.infer<typeof scheduleSchema>[]>> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from('workflow_schedules')
    .select('id,cron_expression,timezone,next_due_at,enabled,workflow_definitions(code)')
    .order('next_due_at')
    .limit(50);
  return error
    ? { data: [], error: 'Schedules could not be loaded.' }
    : parsedRows(data, z.array(scheduleSchema));
}

export async function spendData(): Promise<
  Readonly<{
    forecast: PageData<z.infer<typeof forecastSchema> | null>;
    calls: PageData<z.infer<typeof callSchema>[]>;
  }>
> {
  const client = await createSupabaseServerClient();
  const [forecast, calls] = await Promise.all([
    client
      .from('spend_forecasts')
      .select('actual_spend,expected_completed,original_month_end,adjusted_month_end,confidence')
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('ai_calls')
      .select('id,model_id,actual_cost,estimated_cost,status,created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  return {
    forecast: forecast.error
      ? { data: null, error: 'Spend forecast could not be loaded.' }
      : forecast.data === null
        ? { data: null, error: null }
        : (() => {
            const result = forecastSchema.safeParse(forecast.data);
            return result.success
              ? { data: result.data, error: null }
              : { data: null, error: 'The platform returned an invalid response.' };
          })(),
    calls: calls.error
      ? { data: [], error: 'AI call history could not be loaded.' }
      : parsedRows(calls.data, z.array(callSchema)),
  };
}

export async function operationsData(): Promise<
  PageData<
    Readonly<{ running: number; queued: number; failed: number; approvals: number; stale: number }>
  >
> {
  const client = await createSupabaseServerClient();
  const [running, queued, failed, approvals, stale] = await Promise.all([
    client
      .from('workflow_runs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'running'),
    client.from('job_queue').select('*', { count: 'exact', head: true }).eq('status', 'queued'),
    client.from('workflow_runs').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    client.from('approvals').select('*', { count: 'exact', head: true }).eq('decision', 'pending'),
    client.from('data_freshness').select('*', { count: 'exact', head: true }).eq('state', 'stale'),
  ]);
  if ([running, queued, failed, approvals, stale].some((query) => query.error))
    return {
      data: { running: 0, queued: 0, failed: 0, approvals: 0, stale: 0 },
      error: 'Operations metrics could not be loaded.',
    };
  return {
    data: {
      running: running.count ?? 0,
      queued: queued.count ?? 0,
      failed: failed.count ?? 0,
      approvals: approvals.count ?? 0,
      stale: stale.count ?? 0,
    },
    error: null,
  };
}
