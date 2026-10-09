import { z } from "npm:zod@4.1.5";

const uuidSchema = z.string().uuid();
const jobSchema = z.object({
  id: uuidSchema,
  run_id: uuidSchema,
  job_type: z.string().min(1).max(100),
}).strict();

const executionResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    runId: uuidSchema,
    outcome: z.literal("submitted"),
    responseId: z.string().regex(/^resp_[A-Za-z0-9_-]{6,200}$/),
  }).strict(),
  z.object({
    runId: uuidSchema,
    outcome: z.literal("succeeded"),
    reportId: uuidSchema,
  }).strict(),
  z.object({
    runId: uuidSchema,
    outcome: z.literal("retryable_failure"),
    errorCode: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
  }).strict(),
  z.object({
    runId: uuidSchema,
    outcome: z.literal("terminal_failure"),
    errorCode: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
  }).strict(),
]);

type ExecutionResult = z.infer<typeof executionResponseSchema>;
type CompletionOutcome = Exclude<ExecutionResult["outcome"], "submitted">;

export type JobWorkerDependencies = Readonly<{
  isAuthorized: (request: Request) => boolean;
  claim: (workerId: string) => Promise<{
    data: unknown;
    error: boolean;
  }>;
  execute: (runId: string) => Promise<{
    data: unknown;
    error: boolean;
  }>;
  complete: (
    jobId: string,
    workerId: string,
    outcome: CompletionOutcome,
    errorCode: string | null,
  ) => Promise<{ error: boolean }>;
}>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createJobWorkerHandler(
  dependencies: JobWorkerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return json({ code: "method_not_allowed" }, 405);
    }
    if (!dependencies.isAuthorized(request)) {
      return json({ code: "unauthorised" }, 401);
    }

    const workerId = request.headers.get("x-worker-id")?.trim();
    if (!workerId || workerId.length > 100) {
      return json({ code: "worker_id_required" }, 400);
    }

    let claim: Awaited<ReturnType<JobWorkerDependencies["claim"]>>;
    try {
      claim = await dependencies.claim(workerId);
    } catch {
      return json({ code: "queue_claim_failed" }, 500);
    }
    if (claim.error) return json({ code: "queue_claim_failed" }, 500);

    const jobs = z.array(jobSchema).safeParse(claim.data);
    if (!jobs.success) return json({ code: "invalid_queue_response" }, 502);
    const job = jobs.data[0];
    if (!job) return json({ job: null });

    if (job.job_type !== "workflow_execute") {
      const completion = await dependencies.complete(
        job.id,
        workerId,
        "terminal_failure",
        "unsupported_job_type",
      ).catch(() => ({ error: true }));
      return completion.error
        ? json({ code: "queue_completion_failed" }, 502)
        : json({ code: "unsupported_job_type" }, 422);
    }

    let execution: Awaited<ReturnType<JobWorkerDependencies["execute"]>>;
    try {
      execution = await dependencies.execute(job.run_id);
    } catch {
      execution = { data: null, error: true };
    }

    const outcome = execution.error
      ? null
      : executionResponseSchema.safeParse(execution.data);
    const result = outcome?.success && outcome.data.runId === job.run_id
      ? outcome.data
      : {
        runId: job.run_id,
        outcome: "retryable_failure" as const,
        errorCode: "executor_unavailable_or_invalid_response",
      };

    if (result.outcome === "submitted") {
      return json({
        job: { id: job.id, runId: job.run_id, status: "awaiting_provider" },
        responseId: result.responseId,
      }, 202);
    }

    const errorCode = result.outcome === "succeeded" ? null : result.errorCode;
    let completion: Awaited<ReturnType<JobWorkerDependencies["complete"]>>;
    try {
      completion = await dependencies.complete(
        job.id,
        workerId,
        result.outcome,
        errorCode,
      );
    } catch {
      completion = { error: true };
    }
    if (completion.error) {
      return json({ code: "queue_completion_failed" }, 502);
    }

    return result.outcome === "succeeded"
      ? json({
        job: { id: job.id, runId: job.run_id },
        reportId: result.reportId,
      })
      : json({ code: result.errorCode, outcome: result.outcome }, 200);
  };
}
