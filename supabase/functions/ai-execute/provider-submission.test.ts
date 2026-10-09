import { submitProviderResponse } from "./provider-submission.ts";

Deno.test("queue registration retries the same accepted response idempotently", async () => {
  const calls: Array<[string, string]> = [];
  const waits: number[] = [];
  let attempt = 0;
  const result = await submitProviderResponse(
    "11111111-1111-4111-8111-111111111111",
    "resp_existing_123456",
    (runId, responseId) => {
      calls.push([runId, responseId]);
      attempt += 1;
      if (attempt < 3) {
        return Promise.resolve({
          data: null,
          error: { code: "temporary_unavailable" },
        });
      }
      return Promise.resolve({
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          status: "awaiting_provider",
        },
        error: null,
      });
    },
    (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  );
  if (
    result?.status !== "awaiting_provider" ||
    calls.length !== 3 ||
    waits.join(",") !== "100,200"
  ) {
    throw new Error("provider_queue_submission_retry_contract_failed");
  }
  if (
    calls.some(
      ([runId, responseId]) =>
        runId !== calls[0]?.[0] || responseId !== "resp_existing_123456",
    )
  ) {
    throw new Error("provider_response_identity_changed_during_retry");
  }
});

Deno.test(
  "queue registration stops after bounded failures without resubmitting to provider",
  async () => {
    let calls = 0;
    const result = await submitProviderResponse(
      "11111111-1111-4111-8111-111111111111",
      "resp_existing_123456",
      () => {
        calls += 1;
        return Promise.resolve({
          data: null,
          error: { code: "temporary_unavailable" },
        });
      },
      () => Promise.resolve(),
    );
    if (result !== null || calls !== 3) {
      throw new Error("provider_queue_submission_retry_bound_failed");
    }
  },
);
