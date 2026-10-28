import { assertEquals } from "jsr:@std/assert@1.0.14";
import {
  hasCompatibleWorkerHeartbeat,
  hasFreshWorkerHeartbeat,
  WORKER_HEARTBEAT_FRESHNESS_MS,
} from "./worker-liveness.ts";

Deno.test("worker heartbeat freshness accepts only a current bounded heartbeat", () => {
  const now = Date.parse("2026-10-28T14:30:00.000Z");
  assertEquals(
    hasFreshWorkerHeartbeat(
      new Date(now - WORKER_HEARTBEAT_FRESHNESS_MS).toISOString(),
      now,
    ),
    true,
  );
  assertEquals(
    hasFreshWorkerHeartbeat(
      new Date(now - WORKER_HEARTBEAT_FRESHNESS_MS - 1).toISOString(),
      now,
    ),
    false,
  );
  assertEquals(hasFreshWorkerHeartbeat(null, now), false);
  assertEquals(hasFreshWorkerHeartbeat("not-a-timestamp", now), false);
  assertEquals(
    hasFreshWorkerHeartbeat(new Date(now + 1).toISOString(), now),
    false,
  );
  assertEquals(
    hasCompatibleWorkerHeartbeat({ compatibility: { compatible: true } }),
    true,
  );
  assertEquals(
    hasCompatibleWorkerHeartbeat({ compatibility: { compatible: false } }),
    false,
  );
  assertEquals(hasCompatibleWorkerHeartbeat(null), false);
});
