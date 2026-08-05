import {
  createOpenAiWebhookSignatureForTest,
  verifyOpenAiWebhookSignature,
} from "./openai-webhook-security.ts";

const assert = (condition: boolean) => {
  if (!condition) throw new Error("assertion_failed");
};

Deno.test("OpenAI Standard Webhooks signatures require valid signed content", async () => {
  const now = 1_750_000_000_000;
  const payload = '{"id":"evt_fixture","type":"response.completed"}';
  const secret = "whsec_c3ludGhldGljLXNlY3JldA==";
  const headers = new Headers({
    "webhook-id": "msg_fixture",
    "webhook-timestamp": String(now / 1000),
  });
  headers.set(
    "webhook-signature",
    await createOpenAiWebhookSignatureForTest(
      payload,
      "msg_fixture",
      String(now / 1000),
      secret,
    ),
  );
  assert(await verifyOpenAiWebhookSignature(payload, headers, secret, now));
  assert(
    !(await verifyOpenAiWebhookSignature(`${payload}x`, headers, secret, now)),
  );
  assert(
    !(await verifyOpenAiWebhookSignature(
      payload,
      headers,
      secret,
      now + 301_000,
    )),
  );
});
