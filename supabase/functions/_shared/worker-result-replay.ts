export function completedWorkerScanResponse(
  scan: { status: string; result_verified_at: string | null },
  requestId: string,
): Response | null {
  if (scan.status !== "complete") return null;
  return Response.json({
    accepted: 0,
    replayed: true,
    verifiedAt: scan.result_verified_at,
    stage: "result",
    requestId,
  }, { headers: { "x-request-id": requestId } });
}
