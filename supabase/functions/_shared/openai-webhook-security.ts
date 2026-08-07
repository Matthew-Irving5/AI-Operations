const encoder = new TextEncoder();
const decodeSecret = (secret: string): ArrayBuffer =>
  Uint8Array.from(
    atob(secret.slice("whsec_".length)),
    (char) => char.charCodeAt(0),
  ).buffer as ArrayBuffer;

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export async function verifyOpenAiWebhookSignature(
  payload: string,
  headers: Headers,
  secret: string | undefined,
  nowMilliseconds = Date.now(),
): Promise<boolean> {
  const webhookId = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (
    !secret?.startsWith("whsec_") || !webhookId || !timestamp || !signatures
  ) {
    return false;
  }
  const timestampNumber = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampNumber) ||
    Math.abs(nowMilliseconds / 1000 - timestampNumber) > 300
  ) return false;
  let secretBytes: ArrayBuffer;
  try {
    secretBytes = decodeSecret(secret);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const expected = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          encoder.encode(`${webhookId}.${timestamp}.${payload}`),
        ),
      ),
    ),
  );
  return signatures.split(" ").some((signature) => {
    const [version, value] = signature.split(",", 2);
    return version === "v1" && value !== undefined &&
      timingSafeEqual(value, expected);
  });
}

export async function createOpenAiWebhookSignatureForTest(
  payload: string,
  webhookId: string,
  timestamp: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    decodeSecret(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${webhookId}.${timestamp}.${payload}`),
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}
