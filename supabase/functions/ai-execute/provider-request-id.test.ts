import { providerRequestId } from "./provider-request-id.ts";

Deno.test("provider request identity distinguishes queued dependency resumes", () => {
  const runId = "00000000-0000-4000-8000-000000000101";
  const firstJob = "00000000-0000-4000-8000-000000000102";
  const resumedJob = "00000000-0000-4000-8000-000000000103";
  const first = providerRequestId(runId, firstJob, 1);
  const retry = providerRequestId(runId, firstJob, 2);
  const resumed = providerRequestId(runId, resumedJob, 1);

  if (first === retry || first === resumed || retry === resumed) {
    throw new Error("provider_request_id_must_include_queue_job_and_attempt");
  }
  if (providerRequestId(runId, firstJob, 0) !== first) {
    throw new Error("first_attempt_must_be_one_based");
  }
});
