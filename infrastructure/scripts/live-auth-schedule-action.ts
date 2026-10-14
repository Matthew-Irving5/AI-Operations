export type LiveAuthScheduleAction = Readonly<{
  initialLabel: 'Enabled' | 'Disabled';
  nextEnabled: boolean;
  buttonName: 'Enable schedule (fresh MFA required)' | 'Disable schedule (fresh MFA required)';
  confirmationMessage: 'Schedule enabled.' | 'Schedule disabled.';
}>;

export function liveAuthScheduleAction(statusLabel: string): LiveAuthScheduleAction {
  const match = /^(Enabled|Disabled) ·/.exec(statusLabel);
  if (!match) throw new Error('Visible schedule status is missing or invalid.');

  const initiallyEnabled = match[1] === 'Enabled';
  return {
    initialLabel: initiallyEnabled ? 'Enabled' : 'Disabled',
    nextEnabled: !initiallyEnabled,
    buttonName: initiallyEnabled
      ? 'Disable schedule (fresh MFA required)'
      : 'Enable schedule (fresh MFA required)',
    confirmationMessage: initiallyEnabled ? 'Schedule disabled.' : 'Schedule enabled.',
  };
}
