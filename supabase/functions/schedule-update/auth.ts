const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function hasScheduleUpdateGate(
  gateId: unknown,
  consumeGate: (id: string) => Promise<boolean>,
): Promise<boolean> {
  if (typeof gateId !== "string" || !UUID_PATTERN.test(gateId)) return false;
  try {
    return await consumeGate(gateId);
  } catch {
    return false;
  }
}

export async function runScheduleUpdateWithGate<T>(
  gateId: unknown,
  consumeGate: (id: string) => Promise<boolean>,
  update: () => Promise<T>,
): Promise<{ authorized: boolean; result?: T }> {
  if (!(await hasScheduleUpdateGate(gateId, consumeGate))) {
    return { authorized: false };
  }
  return { authorized: true, result: await update() };
}
