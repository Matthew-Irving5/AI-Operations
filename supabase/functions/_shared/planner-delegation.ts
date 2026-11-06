const DELEGATION_TOOL_NAME = "delegate_to_travel_specialist";

export type PlannerDelegation = Readonly<{
  objective: string;
  contextEvidenceIds: readonly string[];
}>;

export const plannerDelegationTool = {
  type: "function",
  name: DELEGATION_TOOL_NAME,
  description:
    "Ask the Travel specialist for an itinerary when the user's plan needs travel expertise. The server fixes the specialist workflow and approval policy.",
  parameters: {
    type: "object",
    properties: {
      objective: {
        type: "string",
        minLength: 3,
        maxLength: 4000,
      },
      contextEvidenceIds: {
        type: "array",
        maxItems: 50,
        items: { type: "string", format: "uuid" },
      },
    },
    required: ["objective", "contextEvidenceIds"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export type PlannerDelegationCall =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "delegate"; value: PlannerDelegation }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

export function parsePlannerDelegationCall(
  response: Record<string, unknown>,
  allowedEvidenceIds: ReadonlySet<string>,
): PlannerDelegationCall {
  if (!Array.isArray(response.output)) return { kind: "none" };
  const calls = response.output.filter((item) =>
    isRecord(item) && item.type === "function_call"
  );
  if (calls.length === 0) return { kind: "none" };
  if (calls.length !== 1) return { kind: "invalid" };

  const call = calls[0];
  if (
    !isRecord(call) || call.name !== DELEGATION_TOOL_NAME ||
    typeof call.call_id !== "string" || !call.call_id ||
    typeof call.arguments !== "string"
  ) return { kind: "invalid" };

  let argumentsValue: unknown;
  try {
    argumentsValue = JSON.parse(call.arguments);
  } catch {
    return { kind: "invalid" };
  }
  if (!isRecord(argumentsValue)) return { kind: "invalid" };
  const keys = Object.keys(argumentsValue).sort();
  if (keys.join(",") !== "contextEvidenceIds,objective") {
    return { kind: "invalid" };
  }
  const objective = argumentsValue.objective;
  const contextEvidenceIds = argumentsValue.contextEvidenceIds;
  if (
    typeof objective !== "string" || objective.trim().length < 3 ||
    objective.length > 4000 || !Array.isArray(contextEvidenceIds) ||
    contextEvidenceIds.length > 50 || !contextEvidenceIds.every(isUuid) ||
    new Set(contextEvidenceIds).size !== contextEvidenceIds.length ||
    contextEvidenceIds.some((id) => !allowedEvidenceIds.has(id))
  ) return { kind: "invalid" };

  return {
    kind: "delegate",
    value: { objective: objective.trim(), contextEvidenceIds },
  };
}

export function isPlannerDelegationResume(input: unknown): boolean {
  return isRecord(input) && Array.isArray(input.delegationResults) &&
    input.delegationResults.length > 0;
}
