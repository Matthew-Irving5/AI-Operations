import {
  createInterAgentDelegationHandler,
  type InterAgentSourceRun,
} from "./handler.ts";
import type { InterAgentDelegationPersistence } from "../../../packages/manager-core/src/delegation-runtime.ts";

const sourceRunId = "11111111-1111-4111-8111-111111111111";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const source: InterAgentSourceRun = {
  id: sourceRunId,
  userId,
  managerCode: "personal",
  status: "running",
  correlationId: "22222222-2222-4222-8222-222222222222",
  costRootRunId: null,
  routingPath: ["personal"],
};

function createPersistence(): InterAgentDelegationPersistence {
  return {
    createAndQueueRequest: () =>
      Promise.resolve({
        requestId: "33333333-3333-4333-8333-333333333333",
        destinationRunId: "44444444-4444-4444-8444-444444444444",
        duplicate: false,
      }),
    completeAndResume: () => Promise.resolve({ sourceRunId }),
  };
}

function post(body: unknown, authorized = true): Request {
  return new Request("https://local.test/inter-agent-delegation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-secret": authorized ? "worker-secret" : "wrong-secret",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("creates an authenticated, capability-authorized specialist request", async () => {
  let captured:
    | Parameters<InterAgentDelegationPersistence["createAndQueueRequest"]>[0]
    | undefined;
  let authorizedRoute: readonly string[] | undefined;
  const response = await createInterAgentDelegationHandler({
    isAuthorized: (request) =>
      request.headers.get("x-worker-secret") === "worker-secret",
    loadSourceRun: () => Promise.resolve(source),
    authorizer: {
      canDelegate: (from, to) => {
        authorizedRoute = [from, to];
        return Promise.resolve(true);
      },
    },
    persistence: {
      ...createPersistence(),
      createAndQueueRequest: (input) => {
        captured = input;
        return Promise.resolve({
          requestId: input.request.id,
          destinationRunId: "44444444-4444-4444-8444-444444444444",
          duplicate: false,
        });
      },
    },
    newId: () => "55555555-5555-4555-8555-555555555555",
    now: () => "2026-10-21T12:00:00.000Z",
  })(post({
    sourceRunId,
    destinationManagerCode: "travel",
    destinationWorkflowCode: "travel-on-demand-plan",
    objective: "Compare two trip options.",
    requiredOutputContract: { type: "object", additionalProperties: false },
  }));

  if (response.status !== 202) throw new Error("request_must_be_accepted");
  if (
    JSON.stringify(authorizedRoute) !== JSON.stringify(["personal", "travel"])
  ) {
    throw new Error("trusted_manager_route_must_be_authorized");
  }
  if (
    captured?.request.sourceRunId !== sourceRunId ||
    captured.costRootRunId !== sourceRunId
  ) {
    throw new Error("source_and_cost_lineage_must_come_from_trusted_run");
  }
  if (
    JSON.stringify(captured?.plan.routingPath) !==
      JSON.stringify(["personal", "travel"])
  ) {
    throw new Error("routing_path_must_come_from_trusted_run");
  }
  if (
    JSON.stringify(await response.json()) !== JSON.stringify({
      requestId: "55555555-5555-4555-8555-555555555555",
      destinationRunId: "44444444-4444-4444-8444-444444444444",
      duplicate: false,
      status: "requested",
    })
  ) throw new Error("accepted_response_must_reference_durable_run");
});

Deno.test("rejects unauthorized, malformed, non-running, and unregistered routes before persistence", async () => {
  let persistenceCalls = 0;
  const base = {
    isAuthorized: (request: Request) =>
      request.headers.get("x-worker-secret") === "worker-secret",
    loadSourceRun: (runId: string) =>
      Promise.resolve(runId === sourceRunId ? source : null),
    authorizer: { canDelegate: () => Promise.resolve(false) },
    persistence: {
      ...createPersistence(),
      createAndQueueRequest: () => {
        persistenceCalls += 1;
        return Promise.resolve({
          requestId: "33333333-3333-4333-8333-333333333333",
          destinationRunId: "44444444-4444-4444-8444-444444444444",
          duplicate: false,
        });
      },
    },
  } satisfies Parameters<typeof createInterAgentDelegationHandler>[0];
  const handler = createInterAgentDelegationHandler(base);
  const validBody = {
    sourceRunId,
    destinationManagerCode: "travel",
    destinationWorkflowCode: "travel-on-demand-plan",
    objective: "Compare two trip options.",
    requiredOutputContract: { type: "object" },
  };

  if ((await handler(post(validBody, false))).status !== 401) {
    throw new Error("unauthorized_request_must_be_rejected");
  }
  if (
    (await handler(post({ ...validBody, unexpected: true }))).status !== 400
  ) {
    throw new Error("unknown_fields_must_be_rejected");
  }
  if (
    (await handler(
      post({
        ...validBody,
        sourceRunId: "66666666-6666-4666-8666-666666666666",
      }),
    )).status !== 404
  ) {
    throw new Error("unknown_source_run_must_be_rejected");
  }
  if (
    (await handler(post({ ...validBody, destinationManagerCode: "unknown" })))
      .status !== 400
  ) {
    throw new Error("unknown_destination_manager_must_be_rejected");
  }
  if (
    (await createInterAgentDelegationHandler({
      ...base,
      loadSourceRun: () => Promise.resolve({ ...source, status: "succeeded" }),
    })(post(validBody))).status !== 409
  ) {
    throw new Error("completed_source_run_must_not_delegate");
  }
  if ((await handler(post(validBody))).status !== 403) {
    throw new Error("missing_capability_must_be_rejected");
  }
  if (persistenceCalls !== 0) {
    throw new Error("rejected_requests_must_not_reach_persistence");
  }
});
