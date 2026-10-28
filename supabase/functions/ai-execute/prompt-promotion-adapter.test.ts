import {
  createPromptPromotionAdapter,
  type PromptPromotionSource,
  type PromptTransitionInput,
} from "./prompt-promotion-adapter.ts";

const templateId = "00000000-0000-4000-8000-000000000101";
const userId = "00000000-0000-4000-8000-000000000102";
const actionId = "00000000-0000-4000-8000-000000000103";
const executionRequestId = "00000000-0000-4000-8000-000000000104";
const correlationId = "00000000-0000-4000-8000-000000000105";

function sourceFor(
  loadTarget: PromptPromotionSource["loadTarget"],
  transition = (input: PromptTransitionInput) =>
    Promise.resolve({
      activeVersion: input.targetVersion,
      previousVersion: input.expectedActiveVersion,
      replayed: false,
    }),
): PromptPromotionSource {
  return { loadTarget, transition };
}

function context() {
  return {
    userId,
    actionId,
    executionRequestId,
    idempotencyKey: "prompt-promotion-action-001",
    correlationId,
    attempt: 1,
  } as const;
}

Deno.test(
  "prompt promotion binds the live active version and issues a linked reversal token",
  async () => {
    const transitions: PromptTransitionInput[] = [];
    const adapter = createPromptPromotionAdapter(
      sourceFor(
        (_id, targetVersion) =>
          Promise.resolve({
            managerCode: "systems",
            templateCode: "controlled-agent-report",
            activeVersion: 3,
            targetVersion,
            evaluationStatus: targetVersion === 4 ? "evaluated" : "promoted",
            evaluationPassed: true,
          }),
        (input) => {
          transitions.push(input);
          return Promise.resolve({
            activeVersion: input.targetVersion,
            previousVersion: input.expectedActiveVersion,
            replayed: false,
          });
        },
      ),
    );
    const payload = { templateId, targetVersion: 4 };
    const precondition = await adapter.checkPreconditions(payload, context());
    if (!precondition.ready) throw new Error("prompt_precondition_not_ready");
    const outcome = await adapter.execute(payload, {
      ...context(),
      currentStateToken: precondition.currentStateToken,
    });

    if (outcome.kind !== "succeeded") {
      throw new Error("prompt_promotion_not_succeeded");
    }
    if (outcome.reversalToken !== "4:3") {
      throw new Error("prompt_reversal_token_missing");
    }
    if (
      transitions[0]?.operation !== "promote" ||
      transitions[0]?.expectedActiveVersion !== 3
    ) {
      throw new Error("prompt_promotion_version_not_bound");
    }
    if (
      transitions[0]?.actorUserId !== userId ||
      !transitions[0]?.idempotencyKey.startsWith("ai44:promote:")
    ) {
      throw new Error("prompt_transition_identity_not_bound");
    }
  },
);

Deno.test(
  "prompt rollback checks the promoted version and restores only its prior approved version",
  async () => {
    const transitions: PromptTransitionInput[] = [];
    const adapter = createPromptPromotionAdapter(
      sourceFor(
        (_id, targetVersion) =>
          Promise.resolve({
            managerCode: "systems",
            templateCode: "controlled-agent-report",
            activeVersion: 4,
            targetVersion,
            evaluationStatus: "promoted",
            evaluationPassed: true,
          }),
        (input) => {
          transitions.push(input);
          return Promise.resolve({
            activeVersion: input.targetVersion,
            previousVersion: input.expectedActiveVersion,
            replayed: false,
          });
        },
      ),
    );
    const payload = { templateId, targetVersion: 4 };
    const original = {
      kind: "succeeded" as const,
      summary: "Prompt promoted.",
      resultReference: `prompt-template:${templateId}:version:4`,
      changedReferences: [`prompt-template:${templateId}:version:4`],
      reversalToken: "4:3",
    };
    const precondition = await adapter.checkReversalPreconditions!(
      payload,
      original,
      context(),
    );
    if (!precondition.ready) {
      throw new Error("prompt_reversal_precondition_not_ready");
    }
    const outcome = await adapter.reverse!(payload, original, {
      ...context(),
      currentStateToken: precondition.currentStateToken,
      originalReceiptId: "00000000-0000-4000-8000-000000000106",
    });

    if (outcome.kind !== "succeeded" || outcome.reversalToken !== null) {
      throw new Error("prompt_rollback_not_succeeded");
    }
    if (
      transitions[0]?.operation !== "rollback" ||
      transitions[0]?.targetVersion !== 3 ||
      transitions[0]?.expectedActiveVersion !== 4
    ) {
      throw new Error("prompt_rollback_did_not_restore_prior_version");
    }
  },
);

Deno.test("prompt promotion refuses non-Systems targets before an RPC", async () => {
  let transitionCount = 0;
  const adapter = createPromptPromotionAdapter(
    sourceFor(
      (_id, targetVersion) =>
        Promise.resolve({
          managerCode: "finance",
          templateCode: "controlled-agent-report",
          activeVersion: 3,
          targetVersion,
          evaluationStatus: "evaluated",
          evaluationPassed: true,
        }),
      () => {
        transitionCount += 1;
        return Promise.resolve({
          activeVersion: 4,
          previousVersion: 3,
          replayed: false,
        });
      },
    ),
  );
  const precondition = await adapter.checkPreconditions(
    { templateId, targetVersion: 4 },
    context(),
  );

  if (precondition.ready || precondition.reason !== "target_unsupported") {
    throw new Error("non_systems_prompt_target_not_blocked");
  }
  if (transitionCount !== 0) {
    throw new Error("non_systems_prompt_transition_attempted");
  }
});

Deno.test("prompt promotion refuses unevaluated targets before an RPC", async () => {
  let transitionCount = 0;
  const adapter = createPromptPromotionAdapter(
    sourceFor(
      (_id, targetVersion) =>
        Promise.resolve({
          managerCode: "systems",
          templateCode: "controlled-agent-report",
          activeVersion: 3,
          targetVersion,
          evaluationStatus: "draft",
          evaluationPassed: false,
        }),
      () => {
        transitionCount += 1;
        return Promise.resolve({
          activeVersion: 4,
          previousVersion: 3,
          replayed: false,
        });
      },
    ),
  );
  const precondition = await adapter.checkPreconditions(
    { templateId, targetVersion: 4 },
    context(),
  );

  if (precondition.ready || precondition.reason !== "precondition_failed") {
    throw new Error("unevaluated_prompt_target_not_blocked");
  }
  if (transitionCount !== 0) {
    throw new Error("unevaluated_prompt_transition_attempted");
  }
});
