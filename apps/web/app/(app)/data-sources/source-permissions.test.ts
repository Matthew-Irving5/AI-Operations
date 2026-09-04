import { describe, expect, it } from 'vitest';
import {
  actionMessage,
  cadenceLabel,
  freshnessLabel,
  googleScopeDetail,
  latestFreshness,
  parseGoogleSourceResources,
} from './source-permissions';

describe('source permission explanations', () => {
  it('keeps Gmail send explicitly limited to notifications', () => {
    const detail = googleScopeDetail('https://www.googleapis.com/auth/gmail.send');
    expect(detail.access).toBe('Notification only');
    expect(detail.reason).toMatch(/only to send configured notifications/i);
    expect(detail.reason).toMatch(/never uses it to read/i);
  });

  it('labels documented source scopes as read-only', () => {
    expect(googleScopeDetail('https://www.googleapis.com/auth/calendar.readonly').access).toBe(
      'Read-only',
    );
    expect(googleScopeDetail('https://www.googleapis.com/auth/drive.readonly').access).toBe(
      'Read-only',
    );
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
