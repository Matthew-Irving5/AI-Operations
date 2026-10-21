import { describe, expect, it } from 'vitest';
import {
  GOOGLE_DRIVE_EMPTY_STATE,
  GOOGLE_DRIVE_FILE_SCOPE,
  actionMessage,
  cadenceLabel,
  consumeSourceRevokeResume,
  googleFreshnessLabel,
  freshnessLabel,
  googleScopeDetail,
  hasOnlyGoogleDriveFileScope,
  latestFreshness,
  parseGoogleDrivePickerConfiguration,
  parseGooglePickerFiles,
  parseGoogleSourceResources,
  parseGoogleSourceDiscoveryDiagnostic,
} from './source-permissions';

describe('source permission explanations', () => {
  it('keeps a revoke handoff available until the matching source card consumes it', () => {
    const values = new Map([
      ['source_revoke_intent', JSON.stringify({ sourceId: 'mailbox-1', provider: 'google' })],
      ['mfa_job_gate', JSON.stringify({ job: 'connection_revoke', id: 'gate-1' })],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };

    expect(consumeSourceRevokeResume(storage, 'personal-1')).toBeNull();
    expect(values.has('source_revoke_intent')).toBe(true);
    expect(values.has('mfa_job_gate')).toBe(true);
    expect(consumeSourceRevokeResume(storage, 'mailbox-1')).toEqual({
      provider: 'google',
      gateId: 'gate-1',
    });
    expect(values.has('source_revoke_intent')).toBe(false);
    expect(values.has('mfa_job_gate')).toBe(false);
  });

  it('explains an empty Drive list without implying a broken connection or broader access need', () => {
    expect(GOOGLE_DRIVE_EMPTY_STATE).toMatch(/connection is healthy/i);
    expect(GOOGLE_DRIVE_EMPTY_STATE).toMatch(/Choose individual files/i);
    expect(GOOGLE_DRIVE_EMPTY_STATE).toMatch(/do not need to reconnect or grant broader access/i);
  });

  it('accepts only bounded public Picker configuration and rejects missing staging config', () => {
    expect(
      parseGoogleDrivePickerConfiguration({
        picker: {
          oauthClientId: 'web-client.apps.googleusercontent.com',
          apiKey: 'restricted-public-key',
          cloudProjectNumber: '1234567890',
        },
      }),
    ).toEqual({
      oauthClientId: 'web-client.apps.googleusercontent.com',
      apiKey: 'restricted-public-key',
      cloudProjectNumber: '1234567890',
    });
    expect(
      parseGoogleDrivePickerConfiguration({ code: 'google_picker_not_configured' }),
    ).toBeNull();
    expect(
      parseGoogleDrivePickerConfiguration({
        picker: {
          oauthClientId: 'client',
          apiKey: 'key\nnot-safe',
          cloudProjectNumber: '123',
        },
      }),
    ).toBeNull();
  });

  it('accepts only the Drive-file-only GIS token and valid Picker-selected file metadata', () => {
    expect(hasOnlyGoogleDriveFileScope(GOOGLE_DRIVE_FILE_SCOPE)).toBe(true);
    expect(
      hasOnlyGoogleDriveFileScope(
        `${GOOGLE_DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/calendar.events.owned`,
      ),
    ).toBe(false);
    expect(
      parseGooglePickerFiles(
        {
          action: 'picked',
          docs: [
            { id: 'file-1', name: 'Profile', mimeType: 'text/plain' },
            { id: 'file-1', name: 'Duplicate', mimeType: 'text/plain' },
            { id: 'file-2', name: 'Invalid', mimeType: '' },
          ],
        },
        'picked',
      ),
    ).toEqual([{ id: 'file-1', name: 'Profile', mimeType: 'text/plain', modifiedTime: null }]);
    expect(
      parseGooglePickerFiles({ action: 'cancel', docs: [{ id: 'file-1' }] }, 'picked'),
    ).toEqual([]);
  });

  it('keeps Gmail send scoped to communication mailboxes', () => {
    const detail = googleScopeDetail('https://www.googleapis.com/auth/gmail.send');
    expect(detail.access).toBe('Read/write');
    expect(detail.reason).toMatch(/AI Operations mailbox/i);
  });

  it('labels documented source scopes as read-only', () => {
    expect(googleScopeDetail('https://www.googleapis.com/auth/calendar.readonly').access).toBe(
      'Read-only',
    );
    expect(googleScopeDetail('https://www.googleapis.com/auth/drive.file').access).toBe(
      'Read/write',
    );
    expect(googleScopeDetail('https://www.googleapis.com/auth/tasks').access).toBe('Read/write');
  });

  it('derives stale state from the expected cadence', () => {
    const freshness = {
      source: 'google',
      last_source_at: '2026-09-04T08:00:00.000Z',
      last_success_at: '2026-09-04T08:00:00.000Z',
      expected_cadence: '24 hours',
      state: 'fresh',
    };
    expect(freshnessLabel(freshness, Date.parse('2026-09-04T20:00:00.000Z'))).toBe('Fresh');
    expect(freshnessLabel(freshness, Date.parse('2026-09-05T10:00:00.000Z'))).toBe('Stale');
    expect(freshnessLabel({ ...freshness, state: 'reauthentication_required' })).toBe(
      'Needs attention',
    );
  });

  it('distinguishes a connected OAuth account from a source with no sync yet', () => {
    expect(googleFreshnessLabel(null)).toBe('Awaiting first sync');
    expect(
      googleFreshnessLabel({
        source: 'google_gmail',
        last_source_at: null,
        last_success_at: null,
        expected_cadence: '24 hours',
        state: 'not_connected',
      }),
    ).toBe('Needs attention');
  });

  it('keeps discovery diagnostics bounded and safe for UI rendering', () => {
    expect(
      parseGoogleSourceDiscoveryDiagnostic({
        code: 'google_profile_request_failed',
        stage: 'google_source_discovery',
        reason: 'provider_rejected_request',
        status: 502,
        requestId: 'req-123',
        detail: 'access_token=must-not-render',
      }),
    ).toEqual({
      code: 'google_profile_request_failed',
      stage: 'google_source_discovery',
      reason: 'provider_rejected_request',
      status: 502,
      requestId: 'req-123',
    });
    expect(
      parseGoogleSourceDiscoveryDiagnostic(
        {
          code: 'unsafe\ncode',
          stage: 'x'.repeat(101),
          status: 999,
          request_id: 'request-456',
        },
        502,
      ),
    ).toEqual({
      code: 'source_discovery_failed',
      stage: null,
      reason: null,
      status: 502,
      requestId: 'request-456',
    });
  });

  it('provides safe recovery wording for permission and session failures', () => {
    expect(actionMessage('permission_denied', 'fallback')).toMatch(/provider denied/i);
    expect(actionMessage('unauthorised', 'fallback')).toMatch(/Sign in again/i);
    expect(actionMessage('provider_revoke_failed', 'fallback')).toMatch(/rotate the credential/i);
  });

  it('normalizes persisted cadence labels', () => {
    expect(cadenceLabel('24:00:00')).toBe('Every 24 hours');
    expect(cadenceLabel(null)).toBe('Not configured');
  });

  it('selects the newest dataset row for an aggregate source card', () => {
    const rows = [
      {
        source: 'google_calendar',
        last_source_at: '2026-09-02T08:00:00.000Z',
        last_success_at: '2026-09-02T08:00:00.000Z',
        expected_cadence: '24 hours',
        state: 'stale',
      },
      {
        source: 'google_gmail',
        last_source_at: '2026-09-04T08:00:00.000Z',
        last_success_at: '2026-09-04T08:00:00.000Z',
        expected_cadence: '24 hours',
        state: 'fresh',
      },
    ];
    expect(latestFreshness(rows, ['google_calendar', 'google_gmail'])?.source).toBe('google_gmail');
  });

  it('accepts a bounded resource discovery response and preserves intentional empty selections', () => {
    const resources = parseGoogleSourceResources({
      calendars: [
        { id: 'calendar-1', summary: 'Personal', timeZone: 'Europe/London', primary: true },
      ],
      driveFiles: [{ id: 'drive-1', name: 'Profile', mimeType: 'text/plain', modifiedTime: null }],
      selected_calendar_ids: [],
      selected_drive_file_ids: [],
    });
    expect(resources?.selectionSaved).toBe(true);
    expect(resources?.selectedCalendarIds).toEqual([]);
  });

  it('rejects malformed or unbounded resource discovery data', () => {
    expect(parseGoogleSourceResources({ calendars: [], driveFiles: [] })).toBeNull();
    expect(
      parseGoogleSourceResources({
        calendars: [{ id: '', summary: 'Invalid' }],
        driveFiles: [],
        selectedCalendarIds: [],
        selectedDriveFileIds: [],
        selectionSaved: false,
      }),
    ).toBeNull();
  });
});
