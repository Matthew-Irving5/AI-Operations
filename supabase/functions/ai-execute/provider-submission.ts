export type ProviderQueueSubmission = Readonly<{ id: string; status: string }>;
export type SubmitProviderResponsePort = (
  runId: string,
  responseId: string,
) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function submitProviderResponse(
  runId: string,
  responseId: string,
  submit: SubmitProviderResponsePort,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<ProviderQueueSubmission | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await submit(runId, responseId);
      if (
        isRecord(result) && !result.error && isRecord(result.data) &&
        typeof result.data.id === "string" &&
        typeof result.data.status === "string"
      ) {
        return { id: result.data.id, status: result.data.status };
      }
    } catch {
      // Retry the same durable response registration; never create a new response here.
    }
    if (attempt < 2) await wait(100 * (attempt + 1));
  }
  return null;
}
