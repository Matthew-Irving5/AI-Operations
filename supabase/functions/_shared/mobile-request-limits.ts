const oversizedBodyDrainAllowanceBytes = 64 * 1024;

export async function cancelIfDeclaredBodyTooLarge(
  request: Request,
  maximumBytes: number,
): Promise<number | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!(declaredLength > maximumBytes)) return null;

  const reader = request.body?.getReader();
  if (!reader) return declaredLength;

  try {
    const maximumDiscardBytes = maximumBytes + oversizedBodyDrainAllowanceBytes;
    if (declaredLength > maximumDiscardBytes) {
      await reader.cancel();
      return declaredLength;
    }

    let discardedBytes = 0;
    while (discardedBytes <= maximumDiscardBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      discardedBytes += value.byteLength;
      if (discardedBytes > maximumDiscardBytes) await reader.cancel();
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // A closed transport must not prevent returning the bounded rejection.
    }
  } finally {
    reader.releaseLock();
  }
  return declaredLength;
}
