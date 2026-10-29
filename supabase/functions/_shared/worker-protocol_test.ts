import {
  assessWorkerCompatibility,
  MINIMUM_WORKER_VERSION,
  WORKER_CAPABILITIES,
  workerPollSchema,
} from "./worker-protocol.ts";

Deno.test("worker polling rejects versions below the supported minimum", () => {
  const result = assessWorkerCompatibility("0.1.9", [
    WORKER_CAPABILITIES.inventory,
  ]);
  if (
    result.compatible || result.code !== "worker_upgrade_required" ||
    result.minimumVersion !== MINIMUM_WORKER_VERSION
  ) {
    throw new Error("outdated_worker_must_require_upgrade");
  }
});

Deno.test("worker polling requires inventory support but leaves signed actions optional", () => {
  const inventoryOnly = assessWorkerCompatibility("0.2.0", [
    WORKER_CAPABILITIES.inventory,
  ]);
  const missingInventory = assessWorkerCompatibility("0.2.0", [
    WORKER_CAPABILITIES.signedFileActions,
  ]);
  if (!inventoryOnly.compatible) {
    throw new Error("read_only_inventory_worker_must_remain_supported");
  }
  if (
    missingInventory.compatible ||
    missingInventory.code !== "worker_capability_missing"
  ) {
    throw new Error("missing_inventory_capability_must_block_poll");
  }
});

Deno.test("worker poll blocks unknown capabilities and rejects non-UUID devices", () => {
  const unknownCapability = workerPollSchema.safeParse({
    deviceId: "00000000-0000-4000-8000-000000000001",
    workerVersion: "0.2.0",
    capabilities: ["arbitrary_command_execution"],
  });
  const invalidDevice = workerPollSchema.safeParse({
    deviceId: "device-1",
    workerVersion: "0.2.0",
    capabilities: [WORKER_CAPABILITIES.inventory],
  });
  const compatibility = unknownCapability.success
    ? assessWorkerCompatibility(
      unknownCapability.data.workerVersion,
      unknownCapability.data.capabilities,
    )
    : null;
  if (
    !compatibility || compatibility.compatible ||
    compatibility.code !== "worker_capability_unsupported" ||
    invalidDevice.success
  ) {
    throw new Error("unsupported_capability_must_block_poll");
  }
});

Deno.test("worker protocol reports missing metadata as upgrade-required", () => {
  const result = assessWorkerCompatibility(undefined, []);
  if (!result.compatible && result.code === "worker_version_required") return;
  throw new Error("legacy_worker_must_be_identified_for_upgrade");
});
