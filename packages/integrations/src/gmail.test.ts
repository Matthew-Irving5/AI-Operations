import { expect, it } from 'vitest';
import { GmailApiNotifier, MockGmailNotifier } from './gmail';

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

it('uses the Gmail send endpoint with the fixed recipient', async () => {
  let request = '';
  const notifier = new GmailApiNotifier('synthetic-token', async (input, init) => {
    request = `${String(input)}\n${String(init?.body)}`;
    return new Response(JSON.stringify({ id: 'gmail-synthetic' }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  await expect(
    notifier.send({
      to: 'matthew.irving.ai@gmail.com',
      subject: '[AI Operations] Synthetic report',
      html: '<p>safe summary</p>',
      dedupeKey: 'gmail-api-synthetic',
    }),
  ).resolves.toEqual({ messageId: 'gmail-synthetic' });
  expect(request).toContain('gmail.googleapis.com/gmail/v1/users/me/messages/send');
});
