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
export class MockGmailNotifier implements GmailNotifier {
  readonly sent: GmailMessage[] = [];
  async send(message: GmailMessage): Promise<{ messageId: string }> {
    if (message.to.trim().toLowerCase() !== notificationRecipient)
      throw new Error('notification_recipient_forbidden');
    if (!message.subject.startsWith('[AI Operations]'))
      throw new Error('notification_subject_invalid');
    if (this.sent.some((item) => item.dedupeKey === message.dedupeKey))
      return { messageId: `deduplicated:${message.dedupeKey}` };
    this.sent.push(message);
    return { messageId: `mock-${this.sent.length}` };
  }
}
