export const notificationRecipient = 'matthew.irving.ai@gmail.com';
export type GmailMessage = Readonly<{
  to: string;
  subject: string;
  html: string;
  dedupeKey: string;
}>;
export interface GmailNotifier {
  send(message: GmailMessage): Promise<{ messageId: string }>;
}
function validateMessage(message: GmailMessage) {
  if (message.to.trim().toLowerCase() !== notificationRecipient)
    throw new Error('notification_recipient_forbidden');
  if (!message.subject.startsWith('[AI Operations]'))
    throw new Error('notification_subject_invalid');
}
function encodeBase64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}
export class GmailApiNotifier implements GmailNotifier {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!accessToken) throw new Error('gmail_access_token_missing');
  }
  async send(message: GmailMessage): Promise<{ messageId: string }> {
    validateMessage(message);
    const raw = encodeBase64Url(
      [
        `To: ${notificationRecipient}`,
        `Subject: ${message.subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        '',
        message.html,
      ].join('\r\n'),
    );
    const response = await this.fetcher(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      },
    );
    if (!response.ok) throw new Error(`gmail_send_${response.status}`);
    const result = (await response.json()) as { id?: string };
    if (!result.id) throw new Error('gmail_message_id_missing');
    return { messageId: result.id };
  }
}
export class MockGmailNotifier implements GmailNotifier {
  readonly sent: GmailMessage[] = [];
  async send(message: GmailMessage): Promise<{ messageId: string }> {
    validateMessage(message);
    if (this.sent.some((item) => item.dedupeKey === message.dedupeKey))
      return { messageId: `deduplicated:${message.dedupeKey}` };
    this.sent.push(message);
    return { messageId: `mock-${this.sent.length}` };
  }
}
