import { expect, it } from 'vitest';
import { MockGmailNotifier } from './gmail';

it('records a Gmail message ID and deduplicates the notification', async () => {
  const notifier = new MockGmailNotifier();
  const message = {
    to: 'Matthew.irving.ai@gmail.com',
    subject: '[AI Operations] Synthetic report',
    html: '<p>safe summary</p>',
    dedupeKey: 'synthetic-report-2026-08-03',
  };
  await expect(notifier.send(message)).resolves.toEqual({ messageId: 'mock-1' });
  await expect(notifier.send(message)).resolves.toEqual({
    messageId: 'deduplicated:synthetic-report-2026-08-03',
  });
});
