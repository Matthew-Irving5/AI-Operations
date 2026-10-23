export async function cancelIfDeclaredBodyTooLarge(
  request: Request,
  maximumBytes: number,
): Promise<number | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!(declaredLength > maximumBytes)) return null;

  try {
    await request.body?.cancel();
  } catch {
    // A closed transport must not prevent returning the bounded rejection.
  }
  return declaredLength;
}
