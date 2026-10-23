import { z } from 'zod';

const resumeSchema = z.strictObject({
  deviceId: z.string().uuid(),
  deviceLabel: z.string().regex(/^AI28 synthetic [a-f0-9]{8}$/i),
  snapshotInternalId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  snapshotReceivedAt: z.string().datetime({ offset: true }),
  token: z.string().min(21).max(512),
  pairingMfaConfirmation: z.literal('user-completed'),
  shortcutRunConfirmation: z.literal('operator-confirmed'),
});

export type MobileShortcutResume = z.infer<typeof resumeSchema>;

const resumeEnvironmentNames = [
  'LIVE_E2E_MOBILE_RESUME_DEVICE_ID',
  'LIVE_E2E_MOBILE_RESUME_DEVICE_LABEL',
  'LIVE_E2E_MOBILE_RESUME_SNAPSHOT_INTERNAL_ID',
  'LIVE_E2E_MOBILE_RESUME_SNAPSHOT_ID',
  'LIVE_E2E_MOBILE_RESUME_SNAPSHOT_RECEIVED_AT',
  'LIVE_E2E_MOBILE_RESUME_TOKEN',
  'LIVE_E2E_MOBILE_RESUME_PAIRING_MFA',
  'LIVE_E2E_MOBILE_RESUME_SHORTCUT_RUN',
] as const;

export function parseMobileShortcutResume(
  env: Record<string, string | undefined>,
): MobileShortcutResume | undefined {
  const requested = env.LIVE_E2E_MOBILE_RESUME === 'true';
  const hasPartialResume = resumeEnvironmentNames.some((name) => env[name] !== undefined);
  if (!requested && !hasPartialResume) return undefined;

  const parsed = resumeSchema.safeParse({
    deviceId: env.LIVE_E2E_MOBILE_RESUME_DEVICE_ID,
    deviceLabel: env.LIVE_E2E_MOBILE_RESUME_DEVICE_LABEL,
    snapshotInternalId: env.LIVE_E2E_MOBILE_RESUME_SNAPSHOT_INTERNAL_ID,
    snapshotId: env.LIVE_E2E_MOBILE_RESUME_SNAPSHOT_ID,
    snapshotReceivedAt: env.LIVE_E2E_MOBILE_RESUME_SNAPSHOT_RECEIVED_AT,
    token: env.LIVE_E2E_MOBILE_RESUME_TOKEN,
    pairingMfaConfirmation: env.LIVE_E2E_MOBILE_RESUME_PAIRING_MFA,
    shortcutRunConfirmation: env.LIVE_E2E_MOBILE_RESUME_SHORTCUT_RUN,
  });
  if (!requested || !parsed.success) {
    throw new Error(
      'AI-28 resume requires exact staging fixture metadata, confirmation, and a local token.',
    );
  }
  return parsed.data;
}
