import { hasScheduleUpdateGate, runScheduleUpdateWithGate } from "./auth.ts";

Deno.test(
  "schedule enable rejects a missing freshness gate without calling the consumer",
  async () => {
    let called = false;
    const accepted = await hasScheduleUpdateGate(undefined, () => {
      called = true;
      return Promise.resolve(true);
    });

    if (accepted || called) {
      throw new Error("Missing gate was not rejected before consumption.");
    }
  },
);

Deno.test("schedule enable rejects stale, expired, or replayed one-time gates", async () => {
  const accepted = await hasScheduleUpdateGate(
    "600b586a-b6d4-4b57-abe9-875166b0cb42",
    () => Promise.resolve(false),
  );

  if (accepted) {
    throw new Error("Rejected one-time gate authorized schedule enable.");
  }
});

Deno.test(
  "schedule enable accepts a valid one-time gate and supplies its identifier once",
  async () => {
    const supplied: string[] = [];
    const gateId = "600b586a-b6d4-4b57-abe9-875166b0cb42";
    const accepted = await hasScheduleUpdateGate(gateId, (id) => {
      supplied.push(id);
      return Promise.resolve(true);
    });

    if (!accepted || supplied.join(",") !== gateId) {
      throw new Error(
        "Valid one-time gate did not authorize schedule enable exactly once.",
      );
    }
  },
);

Deno.test(
  "schedule enable does not update state when one-time freshness is missing or stale",
  async () => {
    let updated = false;
    const result = await runScheduleUpdateWithGate(
      "600b586a-b6d4-4b57-abe9-875166b0cb42",
      () => Promise.resolve(false),
      () => {
        updated = true;
        return Promise.resolve("updated");
      },
    );

    if (result.authorized || updated) {
      throw new Error(
        "Schedule state changed without a valid one-time freshness gate.",
      );
    }
  },
);

Deno.test("schedule enable applies its update exactly once after gate consumption", async () => {
  let consumed = 0;
  let updates = 0;
  const result = await runScheduleUpdateWithGate(
    "600b586a-b6d4-4b57-abe9-875166b0cb42",
    () => {
      consumed += 1;
      return Promise.resolve(true);
    },
    () => {
      updates += 1;
      return Promise.resolve("updated");
    },
  );

  if (
    !result.authorized || result.result !== "updated" || consumed !== 1 ||
    updates !== 1
  ) {
    throw new Error(
      "Freshly authorized schedule update did not run exactly once.",
    );
  }
});

Deno.test("schedule disable also requires a fresh one-time gate", async () => {
  const accepted = await hasScheduleUpdateGate(
    undefined,
    () => Promise.resolve(true),
  );

  if (accepted) {
    throw new Error("Schedule changes were allowed without the one-time gate.");
  }
});
