import { completedWorkerScanResponse } from "./worker-result-replay.ts";

Deno.test("verified scan replay preserves the original completion and writes nothing", async () => {
  const verifiedAt = "2026-10-24T20:00:00.000Z";
  const response = completedWorkerScanResponse({
    status: "complete",
    result_verified_at: verifiedAt,
  }, "synthetic-request");
  if (!response || response.status !== 200) {
    throw new Error("completed_scan_retry_must_succeed_without_recompletion");
  }
  const body = await response.json();
  if (
    body.accepted !== 0 || body.replayed !== true ||
    body.verifiedAt !== verifiedAt
  ) throw new Error("scan_replay_must_preserve_completion");
  if (response.headers.get("x-request-id") !== "synthetic-request") {
    throw new Error("scan_replay_must_keep_request_correlation");
  }
});

Deno.test("unfinished scans retain normal first-result persistence", () => {
  for (const status of ["queued", "waiting_for_device", "running"]) {
    if (
      completedWorkerScanResponse(
        { status, result_verified_at: null },
        "synthetic-request",
      ) !== null
    ) throw new Error("first_scan_result_must_not_be_treated_as_replay");
  }
});
