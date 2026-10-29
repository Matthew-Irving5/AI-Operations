import { z } from "npm:zod@4.6.6";

export const MINIMUM_WORKER_VERSION = "0.2.0";
export const WORKER_CAPABILITIES = {
  inventory: "digital_inventory_v1",
  signedFileActions: "signed_file_actions_v1",
} as const;

const workerVersionSchema = z.string().max(32).regex(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
).refine(
  (version) =>
    version.split(".").every((part) => Number.isSafeInteger(Number(part))),
);
const workerCapabilitySchema = z.string().min(1).max(64).regex(/^[a-z0-9_]+$/);
const capabilitiesSchema = z.array(workerCapabilitySchema).max(16).refine(
  (capabilities) => new Set(capabilities).size === capabilities.length,
).default([]);
const deviceIdSchema = z.string().uuid();

export const workerHeartbeatSchema = z.object({
  deviceId: deviceIdSchema,
  workerVersion: workerVersionSchema.nullable().optional(),
  capabilities: capabilitiesSchema,
  status: z.object({
    transport: z.literal("outbound_https"),
    mode: z.enum(["active", "online", "offline"]).optional(),
  }).strict().optional().default({ transport: "outbound_https" }),
}).strict();

export const workerPollSchema = z.object({
  deviceId: deviceIdSchema,
  workerVersion: workerVersionSchema.nullable().optional(),
  capabilities: capabilitiesSchema,
}).strict();

export type WorkerCapability = string;
export type WorkerHeartbeat = z.infer<typeof workerHeartbeatSchema>;
export type WorkerPoll = z.infer<typeof workerPollSchema>;
export type WorkerCompatibility =
  | {
    compatible: true;
    minimumVersion: string;
    requiredCapabilities: readonly WorkerCapability[];
    actualCapabilities: readonly WorkerCapability[];
  }
  | {
    compatible: false;
    code:
      | "worker_version_required"
      | "worker_upgrade_required"
      | "worker_capability_missing"
      | "worker_capability_unsupported";
    minimumVersion: string;
    actualVersion: string | null;
    requiredCapabilities: readonly WorkerCapability[];
    actualCapabilities: readonly WorkerCapability[];
  };

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function assessWorkerCompatibility(
  version: string | null | undefined,
  capabilities: readonly WorkerCapability[],
): WorkerCompatibility {
  const requiredCapabilities = [WORKER_CAPABILITIES.inventory] as const;
  if (!version) {
    return {
      compatible: false,
      code: "worker_version_required",
      minimumVersion: MINIMUM_WORKER_VERSION,
      actualVersion: null,
      requiredCapabilities,
      actualCapabilities: capabilities,
    };
  }
  if (compareVersions(version, MINIMUM_WORKER_VERSION) < 0) {
    return {
      compatible: false,
      code: "worker_upgrade_required",
      minimumVersion: MINIMUM_WORKER_VERSION,
      actualVersion: version,
      requiredCapabilities,
      actualCapabilities: capabilities,
    };
  }
  const knownCapabilities: readonly string[] = Object.values(
    WORKER_CAPABILITIES,
  );
  if (
    capabilities.some((capability) => !knownCapabilities.includes(capability))
  ) {
    return {
      compatible: false,
      code: "worker_capability_unsupported",
      minimumVersion: MINIMUM_WORKER_VERSION,
      actualVersion: version,
      requiredCapabilities,
      actualCapabilities: capabilities,
    };
  }
  if (
    !requiredCapabilities.every((capability) =>
      capabilities.includes(capability)
    )
  ) {
    return {
      compatible: false,
      code: "worker_capability_missing",
      minimumVersion: MINIMUM_WORKER_VERSION,
      actualVersion: version,
      requiredCapabilities,
      actualCapabilities: capabilities,
    };
  }
  return {
    compatible: true,
    minimumVersion: MINIMUM_WORKER_VERSION,
    requiredCapabilities,
    actualCapabilities: capabilities,
  };
}
