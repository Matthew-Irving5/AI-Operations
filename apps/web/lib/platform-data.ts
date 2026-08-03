import { z } from 'zod';
import { createSupabaseServerClient } from './supabase-server';

const reportSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  report_type: z.string(),
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
const queueJobSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  job_type: z.string(),
  priority: z.number(),
  attempt_count: z.number(),
  status: z.string(),
  available_at: z.string(),
  workflow_runs: z
    .object({
      trigger: z.string(),
      workflow_definitions: z.object({ code: z.string() }).nullable(),
    })
    .nullable(),
});
const personalEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  source: z.string(),
});
const reminderSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  due_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  priority: z.number(),
  list_name: z.string(),
});
const routineSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  cadence: z.string(),
  active: z.boolean(),
});
const connectionSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  account_label: z.string(),
  status: z.string(),
  scopes: z.array(z.string()),
  created_at: z.string(),
});
const healthSummarySchema = z.object({
  summary_date: z.string(),
  metrics: z.record(z.string(), z.unknown()),
  data_confidence: z.string(),
  completeness: z.coerce.number(),
});
const financeCloseSchema = z.object({
  id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  close_kind: z.string(),
  readiness: z.string(),
  reconciled: z.boolean(),
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
    .select('id,title,report_type,summary,status,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  return error
    ? { data: [], error: 'Reports could not be loaded.' }
    : parsedRows(data, z.array(reportSchema));
}

export async function feedbackCategoriesData(): Promise<
  PageData<Readonly<{ workflow_code: string; label: string }>[]>
> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from('feedback_categories')
    .select('workflow_code,label')
    .eq('active', true)
    .order('workflow_code')
    .order('label');
  const schema = z.array(z.object({ workflow_code: z.string(), label: z.string() }));
  return error
    ? { data: [], error: 'Feedback categories could not be loaded.' }
    : parsedRows(data, schema);
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

export async function queueJobsData(): Promise<PageData<z.infer<typeof queueJobSchema>[]>> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from('job_queue')
    .select(
      'id,run_id,job_type,priority,attempt_count,status,available_at,workflow_runs(trigger,workflow_definitions(code))',
    )
    .in('status', ['queued', 'leased', 'dead_letter'])
    .order('available_at')
    .limit(50);
  return error
    ? { data: [], error: 'Queue items could not be loaded.' }
    : parsedRows(data, z.array(queueJobSchema));
}

export async function personalOperationsData(): Promise<
  Readonly<{
    events: PageData<z.infer<typeof personalEventSchema>[]>;
    reminders: PageData<z.infer<typeof reminderSchema>[]>;
    routines: PageData<z.infer<typeof routineSchema>[]>;
  }>
> {
  const client = await createSupabaseServerClient();
  const horizon = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  const [events, reminders, routines] = await Promise.all([
    client
      .from('calendar_events')
      .select('id,title,starts_at,ends_at,source')
      .gte('ends_at', new Date().toISOString())
      .lte('starts_at', horizon)
      .order('starts_at')
      .limit(100),
    client
      .from('reminders')
      .select('id,title,due_at,completed_at,priority,list_name')
      .is('completed_at', null)
      .order('due_at')
      .limit(100),
    client
      .from('routines')
      .select('id,title,cadence,active')
      .eq('active', true)
      .order('title')
      .limit(100),
  ]);
  return {
    events: events.error
      ? { data: [], error: 'Calendar events could not be loaded.' }
      : parsedRows(events.data, z.array(personalEventSchema)),
    reminders: reminders.error
      ? { data: [], error: 'Reminders could not be loaded.' }
      : parsedRows(reminders.data, z.array(reminderSchema)),
    routines: routines.error
      ? { data: [], error: 'Routines could not be loaded.' }
      : parsedRows(routines.data, z.array(routineSchema)),
  };
}

export async function connectionsData(): Promise<PageData<z.infer<typeof connectionSchema>[]>> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from('connections')
    .select('id,provider,account_label,status,scopes,created_at')
    .order('created_at', { ascending: false });
  return error
    ? { data: [], error: 'Connections could not be loaded.' }
    : parsedRows(data, z.array(connectionSchema));
}

export async function healthData(): Promise<
  Readonly<{
    summaries: PageData<z.infer<typeof healthSummarySchema>[]>;
    importCount: PageData<number>;
  }>
> {
  const client = await createSupabaseServerClient();
  const [summaries, imports] = await Promise.all([
    client
      .from('health_daily_summaries')
      .select('summary_date,metrics,data_confidence,completeness')
      .order('summary_date', { ascending: false })
      .limit(30),
    client.from('health_imports').select('*', { count: 'exact', head: true }),
  ]);
  return {
    summaries: summaries.error
      ? { data: [], error: 'Health summaries could not be loaded.' }
      : parsedRows(summaries.data, z.array(healthSummarySchema)),
    importCount: imports.error
      ? { data: 0, error: 'Health source status could not be loaded.' }
      : { data: imports.count ?? 0, error: null },
  };
}

export async function financeData(): Promise<
  Readonly<{
    closes: PageData<z.infer<typeof financeCloseSchema>[]>;
    transactionCount: PageData<number>;
  }>
> {
  const client = await createSupabaseServerClient();
  const [closes, transactions] = await Promise.all([
    client
      .from('finance_close_periods')
      .select('id,period_start,period_end,close_kind,readiness,reconciled')
      .order('period_end', { ascending: false })
      .limit(24),
    client.from('finance_transactions').select('*', { count: 'exact', head: true }),
  ]);
  return {
    closes: closes.error
      ? { data: [], error: 'Finance close state could not be loaded.' }
      : parsedRows(closes.data, z.array(financeCloseSchema)),
    transactionCount: transactions.error
      ? { data: 0, error: 'Finance transaction status could not be loaded.' }
      : { data: transactions.count ?? 0, error: null },
  };
}
