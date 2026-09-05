export type SourceFreshness = {
  source: string;
  last_source_at: string | null;
  last_success_at: string | null;
  expected_cadence: string | null;
  state: string;
  stale_reason?: string | null | undefined;
};

export type GoogleCalendarResource = {
  id: string;
  summary: string;
  timeZone: string | null;
  primary: boolean;
};

export type GoogleDriveResource = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
};

export type GoogleSourceResources = {
  calendars: GoogleCalendarResource[];
  driveFiles: GoogleDriveResource[];
  selectedCalendarIds: string[];
  selectedDriveFileIds: string[];
  selectionSaved: boolean;
};

export type GoogleSourceDiscoveryDiagnostic = Readonly<{
  code: string;
  stage: string | null;
  reason: string | null;
  status: number | null;
  requestId: string | null;
}>;

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function boundedDiagnosticString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) return null;
  if (
    [...trimmed].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f;
    })
  )
    return null;
  return trimmed;
}

function diagnosticStatus(value: unknown, fallback: number | null): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 100 || value > 599) {
    return fallback;
  }
  return value;
}

export function parseGoogleSourceDiscoveryDiagnostic(
  value: unknown,
  fallbackStatus: number | null = null,
): GoogleSourceDiscoveryDiagnostic {
  const root = recordValue(value);
  const nested = recordValue(root?.error);
  const code =
    boundedDiagnosticString(root?.code ?? nested?.code, 100) ?? 'source_discovery_failed';
  return {
    code,
    stage: boundedDiagnosticString(root?.stage ?? nested?.stage, 100),
    reason: boundedDiagnosticString(root?.reason ?? nested?.reason, 160),
    status: diagnosticStatus(root?.status ?? nested?.status, fallbackStatus),
    requestId: boundedDiagnosticString(
      root?.requestId ?? root?.request_id ?? nested?.requestId ?? nested?.request_id,
      128,
    ),
  };
}

export function googleFreshnessLabel(
  freshness: SourceFreshness | null | undefined,
  now = Date.now(),
): 'Fresh' | 'Stale' | 'Needs attention' | 'Awaiting first sync' {
  if (!freshness) return 'Awaiting first sync';
  const label = freshnessLabel(freshness, now);
  return label === 'Not connected' ? 'Awaiting first sync' : label;
}

export function parseGoogleSourceResources(value: unknown): GoogleSourceResources | null {
  const root = recordValue(value);
  if (!root) return null;
  const calendarsValue = root.calendars;
  const driveFilesValue = root.driveFiles;
  if (!Array.isArray(calendarsValue) || !Array.isArray(driveFilesValue)) return null;
  const calendars: GoogleCalendarResource[] = [];
  for (const item of calendarsValue) {
    const row = recordValue(item);
    const id = row ? stringValue(row.id) : null;
    const summary = row ? stringValue(row.summary) : null;
    if (!id || !summary) return null;
    calendars.push({
      id,
      summary,
      timeZone: row && typeof row.timeZone === 'string' ? row.timeZone : null,
      primary: row?.primary === true,
    });
  }
  const driveFiles: GoogleDriveResource[] = [];
  for (const item of driveFilesValue) {
    const row = recordValue(item);
    const id = row ? stringValue(row.id) : null;
    const name = row ? stringValue(row.name) : null;
    const mimeType = row ? stringValue(row.mimeType) : null;
    if (!id || !name || !mimeType) return null;
    driveFiles.push({
      id,
      name,
      mimeType,
      modifiedTime: row && typeof row.modifiedTime === 'string' ? row.modifiedTime : null,
    });
  }
  const selectedCalendarRaw = root.selectedCalendarIds ?? root.selected_calendar_ids;
  const selectedDriveRaw = root.selectedDriveFileIds ?? root.selected_drive_file_ids;
  const selectedCalendarIds = stringArray(selectedCalendarRaw);
  const selectedDriveFileIds = stringArray(selectedDriveRaw);
  if (!selectedCalendarIds || !selectedDriveFileIds) return null;
  const selectionSaved =
    typeof root.selectionSaved === 'boolean'
      ? root.selectionSaved
      : Array.isArray(selectedCalendarRaw) || Array.isArray(selectedDriveRaw);
  return {
    calendars,
    driveFiles,
    selectedCalendarIds,
    selectedDriveFileIds,
    selectionSaved,
  };
}

export const GOOGLE_SCOPE_DETAILS: Readonly<
  Record<
    string,
    Readonly<{ label: string; access: 'Read-only' | 'Notification only'; reason: string }>
  >
> = {
  'https://www.googleapis.com/auth/gmail.readonly': {
    label: 'Gmail',
    access: 'Read-only',
    reason: 'Reads message metadata for personal, career, and finance workflows.',
  },
  'https://www.googleapis.com/auth/gmail.send': {
    label: 'Gmail send',
    access: 'Notification only',
    reason:
      'Needed only to send configured notifications; the app never uses it to read, delete, or alter mail.',
  },
  'https://www.googleapis.com/auth/calendar.readonly': {
    label: 'Google Calendar',
    access: 'Read-only',
    reason:
      'Reads events and availability for planning. Calendar events are never changed by sync.',
  },
  'https://www.googleapis.com/auth/drive.readonly': {
    label: 'Google Drive',
    access: 'Read-only',
    reason: 'Lists existing files for ingestion; it is not primary archival storage.',
  },
};

export function googleScopeDetail(scope: string) {
  return (
    GOOGLE_SCOPE_DETAILS[scope] ?? {
      label: scope,
      access: 'Read-only' as const,
      reason:
        'This permission is not in the documented source policy. Review it before continuing.',
    }
  );
}

export function sourceDate(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  }).format(date);
}

export function cadenceLabel(value: string | null): string {
  if (!value) return 'Not configured';
  const normalized = value.trim().toLowerCase();
  if (normalized === '24:00:00' || normalized === '24 hours' || normalized === '1 day')
    return 'Every 24 hours';
  if (normalized === '06:00:00' || normalized === '6 hours') return 'Every 6 hours';
  return value;
}

export function freshnessLabel(
  freshness: SourceFreshness | null | undefined,
  now = Date.now(),
): 'Fresh' | 'Stale' | 'Needs attention' | 'Not connected' {
  if (!freshness) return 'Not connected';
  if (['stale', 'error', 'failed'].includes(freshness.state.toLowerCase())) return 'Stale';
  if (freshness.state.toLowerCase().includes('denied')) return 'Needs attention';
  if (freshness.state.toLowerCase().includes('reauth')) return 'Needs attention';
  if (!freshness.last_success_at) return 'Needs attention';
  const success = new Date(freshness.last_success_at).getTime();
  if (Number.isNaN(success)) return 'Needs attention';
  const cadenceMs = cadenceMilliseconds(freshness.expected_cadence);
  return now - success > cadenceMs ? 'Stale' : 'Fresh';
}

export function latestFreshness(
  rows: readonly SourceFreshness[],
  sources: readonly string[],
): SourceFreshness | null {
  return (
    rows
      .filter((row) => sources.includes(row.source))
      .sort((left, right) => {
        const leftTime = new Date(left.last_success_at ?? left.last_source_at ?? 0).getTime();
        const rightTime = new Date(right.last_success_at ?? right.last_source_at ?? 0).getTime();
        return rightTime - leftTime;
      })[0] ?? null
  );
}

function cadenceMilliseconds(value: string | null): number {
  if (!value) return 24 * 60 * 60 * 1000;
  const hours = value.match(/^(\d+(?:\.\d+)?)\s*hours?$/i);
  if (hours) return Number(hours[1]) * 60 * 60 * 1000;
  const time = value.match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  if (time) return (Number(time[1]) * 60 * 60 + Number(time[2]) * 60 + Number(time[3])) * 1000;
  if (/day/i.test(value)) return 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function actionMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'unauthorised':
    case 'forbidden':
      return 'Your session no longer has permission for this action. Sign in again and retry.';
    case 'fresh_mfa_required':
    case 'reauthentication_required':
    case 'google_reauth_required':
    case 'token_refresh_failed':
      return 'This source needs reauthentication. Reconnect it to restore access; existing data remains retained.';
    case 'connection_not_found':
    case 'connection_unavailable':
    case 'device_not_found':
      return 'This source is no longer available. Refresh the page to check its current state.';
    case 'permission_denied':
      return 'The provider denied this request. Review the source permissions and reconnect only the access you need.';
    case 'provider_revoke_failed':
    case 'provider_revoke_unconfirmed':
      return 'Local access was disabled, but the provider did not confirm credential revocation. Open the provider security page, revoke AI Operations access, and rotate the credential before reconnecting.';
    default:
      return fallback;
  }
}
