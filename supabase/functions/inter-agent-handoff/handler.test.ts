import type { ConversationHandoff } from "@ai-operations/contracts";
import type { ConversationHandoffPersistence } from "../../../packages/manager-core/src/handoff-runtime.ts";
import { createInterAgentHandoffHandler } from "./handler.ts";

const handoff: ConversationHandoff = {
  contractVersion: 1,
  id: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  fromManagerCode: "personal",
  toManagerCode: "travel",
  reason: "Travel owns the domain judgement for this request.",
  sourceMessageId: "33333333-3333-4333-8333-333333333333",
  status: "requested",
  initiatedAt: "2026-10-21T12:00:00.000Z",
  acceptedAt: null,
  correlationId: "44444444-4444-4444-8444-444444444444",
  idempotencyKey: "handoff:conversation:owner:travel",
};

function persistence(): ConversationHandoffPersistence {
  return {
    createRequestedHandoff: ({ handoff: requested }) =>
      Promise.resolve({ handoffId: requested.id, duplicate: false }),
    resolveHandoff: ({ status }) =>
      Promise.resolve({
        conversationId: handoff.conversationId,
        currentManagerCode: status === "accepted" ? "travel" : "personal",
      }),
  };
}

function post(body: unknown, authorized = true): Request {
  return new Request("https://local.test/inter-agent-handoff", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-secret": authorized ? "worker-secret" : "invalid",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("persists a requested handoff and resolves ownership through the canonical runtime", async () => {
  let loadedKey: readonly string[] | undefined;
  const handler = createInterAgentHandoffHandler({
    isAuthorized: (request) =>
      request.headers.get("x-worker-secret") === "worker-secret",
    loadHandoff: (handoffId, userId) => {
      loadedKey = [handoffId, userId];
      return Promise.resolve(handoff);
    },
    authorizer: { canTransferOwnership: () => Promise.resolve(true) },
    persistence: persistence(),
  });

  const requested = await handler(post({ operation: "request", handoff }));
  if (requested.status !== 202) {
    throw new Error("handoff_request_must_be_accepted");
  }
  const requestBody = await requested.json();
  if (requestBody.handoffId !== handoff.id || requestBody.duplicate !== false) {
    throw new Error("handoff_response_must_reference_durable_record");
  }

  const resolved = await handler(post({
    operation: "resolve",
    handoffId: handoff.id,
    userId: handoff.userId,
    status: "accepted",
    actorManagerCode: "travel",
  }));
  if (resolved.status !== 200) {
    throw new Error("handoff_acceptance_must_resolve");
  }
  if (
    JSON.stringify(loadedKey) !== JSON.stringify([handoff.id, handoff.userId])
  ) {
    throw new Error("handoff_must_be_loaded_for_the_claimed_user");
  }
  if ((await resolved.json()).currentManagerCode !== "travel") {
    throw new Error("acceptance_must_return_new_owner");
  }
});

Deno.test("rejects unauthorized or invalid handoff transitions before persistence", async () => {
  let persistenceCalls = 0;
  const store = persistence();
  const handler = createInterAgentHandoffHandler({
    isAuthorized: (request) =>
      request.headers.get("x-worker-secret") === "worker-secret",
    loadHandoff: () => Promise.resolve(handoff),
    authorizer: { canTransferOwnership: () => Promise.resolve(true) },
    persistence: {
      createRequestedHandoff: (...args) => {
        persistenceCalls += 1;
        return store.createRequestedHandoff(...args);
      },
      resolveHandoff: (...args) => {
        persistenceCalls += 1;
        return store.resolveHandoff(...args);
      },
    },
  });

  if (
    (await handler(post({ operation: "request", handoff }, false))).status !==
      401
  ) {
    throw new Error("unauthorized_handoff_must_be_rejected");
  }
  if (
    (await handler(post({
      operation: "resolve",
      handoffId: handoff.id,
      userId: handoff.userId,
      status: "accepted",
      actorManagerCode: "personal",
    }))).status !== 422
  ) {
    throw new Error("non_destination_acceptance_must_be_rejected");
  }
  if (persistenceCalls !== 0) {
    throw new Error("invalid_handoff_must_not_persist");
  }
});
