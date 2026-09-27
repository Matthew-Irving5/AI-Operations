'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleConnect } from './google-connect';
import {
  actionMessage,
  cadenceLabel,
  freshnessLabel,
  googleScopeDetail,
  googleFreshnessLabel,
  latestFreshness,
  parseGoogleSourceDiscoveryDiagnostic,
  parseGoogleSourceResources,
  sourceDate,
  type GoogleSourceResources,
  type GoogleSourceDiscoveryDiagnostic,
  type SourceFreshness,
} from './source-permissions';

type Connection = {
  id: string;
  provider: string;
  account_role: string;
  environment: 'staging' | 'production';
  account_label: string;
  status: string;
  scopes: string[];
  created_at: string;
  configuration?: Record<string, unknown>;
};

type AppleDevice = {
  id: string;
  label: string;
  enabled_lists: string[];
  revoked_at: string | null;
  last_seen_at: string | null;
  created_at: string;
};

type ActionBody = {
  code?: string;
  message?: string;
  provider_revoked?: boolean;
  credential_deleted?: boolean;
};

type SelectionIntent = {
  connectionId: string;
  selectedCalendarIds: string[];
  selectedDriveFileIds: string[];
};

function parseSelectionIntent(value: unknown): SelectionIntent | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const calendarIds = record.selectedCalendarIds;
  const driveIds = record.selectedDriveFileIds;
  if (
    typeof record.connectionId !== 'string' ||
    !Array.isArray(calendarIds) ||
    !Array.isArray(driveIds) ||
    calendarIds.length > 100 ||
    driveIds.length > 100 ||
    !calendarIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256) ||
    !driveIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256)
  )
    return null;
  return {
    connectionId: record.connectionId,
    selectedCalendarIds: calendarIds,
    selectedDriveFileIds: driveIds,
  };
}

async function responseBody(response: Response): Promise<ActionBody> {
  return (await response.json().catch(() => null)) as ActionBody;
}

async function runGoogleSync(connectionId: string) {
  const idempotencyKey = crypto.randomUUID();
  const response = await fetch('/api/connections/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId, provider: 'google', idempotencyKey }),
  });
  return { response, body: await responseBody(response) };
}

async function revokeConnection(connectionId: string, provider: string, mfaGateId: string) {
  const response = await fetch('/api/connections/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId, provider, mfaGateId }),
  });
  return { response, body: await responseBody(response) };
}

function useRevokeFlow(
  sourceId: string,
  provider: string,
  onComplete: () => void,
  setStatus: (value: string) => void,
) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const revoke = useCallback(() => {
    if (!confirming) {
      setConfirming(true);
      setStatus('Revoke requires fresh MFA. Confirm to continue, then verify your identity.');
      return;
    }
    sessionStorage.setItem('source_revoke_intent', JSON.stringify({ sourceId, provider }));
    window.location.assign(
      `/mfa?returnTo=%2Fdata-sources%3Fresume%3Dsource_revoke&job=connection_revoke`,
    );
  }, [confirming, provider, setStatus, sourceId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('resume') !== 'source_revoke') return;
    const rawIntent = sessionStorage.getItem('source_revoke_intent');
    const rawGate = sessionStorage.getItem('mfa_job_gate');
    sessionStorage.removeItem('source_revoke_intent');
    sessionStorage.removeItem('mfa_job_gate');
    if (!rawIntent || !rawGate) return;
    try {
      const intent = JSON.parse(rawIntent) as { sourceId?: string; provider?: string };
      const gate = JSON.parse(rawGate) as { job?: string; id?: string };
      if (gate.job !== 'connection_revoke' || !gate.id || intent.sourceId !== sourceId) return;
      window.setTimeout(() => {
        setBusy(true);
        void revokeConnection(intent.sourceId!, intent.provider ?? provider, gate.id!).then(
          ({ response, body }) => {
            setBusy(false);
            if (!response.ok) {
              setStatus(
                actionMessage(body.code, `Revoke failed (${body.code ?? response.status}).`),
              );
              return;
            }
            setStatus(
              body.provider_revoked === false
                ? `Local access was disabled, but ${provider === 'google' ? 'Google' : 'the Apple provider'} did not confirm credential revocation. Open the provider security settings, revoke AI Operations access, and rotate the credential before reconnecting. Existing retained data is unchanged.`
                : 'Source revoked. Existing retained data is unchanged, and future syncs are blocked.',
            );
            onComplete();
          },
        );
      }, 0);
    } catch {
      setStatus('The saved revoke request was invalid. Start revoke again.');
    }
  }, [onComplete, provider, setStatus, sourceId]);

  return { confirming, busy, revoke };
}

export function GoogleSourceCard({
  connection,
  freshness,
}: Readonly<{ connection: Connection; freshness: SourceFreshness[] }>) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [resourceState, setResourceState] = useState<
    Readonly<{
      status: 'loading' | 'ready' | 'error';
      data: GoogleSourceResources | null;
      error: GoogleSourceDiscoveryDiagnostic | null;
    }>
  >({ status: 'loading', data: null, error: null });
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [selectedDriveFileIds, setSelectedDriveFileIds] = useState<string[]>([]);
  const [selectionSaved, setSelectionSaved] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const completeRevoke = useCallback(() => {
    setRevoked(true);
    router.refresh();
  }, [router]);
  const onRevokeStatus = useCallback((value: string) => setStatus(value), []);
  const revokeFlow = useRevokeFlow(connection.id, 'google', completeRevoke, onRevokeStatus);
  const state = revoked ? 'revoked' : connection.status;
  const loadResources = useCallback(async () => {
    setResourceState({ status: 'loading', data: null, error: null });
    try {
      const response = await fetch(
        `/api/connections/sources?connectionId=${encodeURIComponent(connection.id)}`,
        { headers: { accept: 'application/json' } },
      );
      const body: unknown = await response.json().catch(() => null);
      const resources = parseGoogleSourceResources(body);
      if (!response.ok || !resources) {
        setResourceState({
          status: 'error',
          data: null,
          error: parseGoogleSourceDiscoveryDiagnostic(body, response.status),
        });
        return;
      }
      setSelectedCalendarIds(resources.selectedCalendarIds);
      setSelectedDriveFileIds(resources.selectedDriveFileIds);
      setSelectionSaved(resources.selectionSaved);
      setResourceState({ status: 'ready', data: resources, error: null });
    } catch {
      setResourceState({
        status: 'error',
        data: null,
        error: {
          code: 'source_discovery_unavailable',
          stage: 'browser_request',
          reason: 'network_failure',
          status: null,
          requestId: null,
        },
      });
    }
  }, [connection.id]);
  useEffect(() => {
    if (state === 'connected') {
      const timer = window.setTimeout(() => void loadResources(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [loadResources, state]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('resume') !== 'source_scope_change') return;
    const rawIntent = sessionStorage.getItem('source_scope_change_intent');
    const rawGate = sessionStorage.getItem('mfa_job_gate');
    sessionStorage.removeItem('source_scope_change_intent');
    sessionStorage.removeItem('mfa_job_gate');
    if (!rawIntent || !rawGate) return;
    try {
      const intent = parseSelectionIntent(JSON.parse(rawIntent) as unknown);
      const gate = JSON.parse(rawGate) as { job?: string; id?: string };
      if (
        !intent ||
        intent.connectionId !== connection.id ||
        gate.job !== 'connection_scope_change'
      ) {
        window.setTimeout(
          () =>
            setStatus('The saved Google selection change could not be resumed. Start it again.'),
          0,
        );
        return;
      }
      if (!gate.id) {
        window.setTimeout(
          () => setStatus('Fresh MFA did not produce a selection-change gate. Start it again.'),
          0,
        );
        return;
      }
      const timer = window.setTimeout(() => {
        setSavingSelection(true);
        setStatus('Saving Google source selection…');
        void fetch('/api/connections/sources', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...intent,
            idempotencyKey: crypto.randomUUID(),
            mfaGateId: gate.id,
          }),
        })
          .then(async (response) => ({ response, body: await responseBody(response) }))
          .then(({ response, body }) => {
            if (!response.ok) {
              setStatus(
                actionMessage(body.code, `Google source selection failed (${response.status}).`),
              );
              return;
            }
            setSelectedCalendarIds(intent.selectedCalendarIds);
            setSelectedDriveFileIds(intent.selectedDriveFileIds);
            setSelectionSaved(true);
            setStatus(
              intent.selectedCalendarIds.length > 0 && intent.selectedDriveFileIds.length > 0
                ? 'Google source selection saved. Sync is ready.'
                : 'Google source selection saved as empty. No calendars or Drive files will be ingested.',
            );
            router.refresh();
          })
          .catch(() =>
            setStatus(
              'Google source selection could not be saved. Check your connection and try again.',
            ),
          )
          .finally(() => setSavingSelection(false));
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      window.setTimeout(
        () => setStatus('The saved selection change was invalid. Start it again.'),
        0,
      );
    }
  }, [connection.id, router]);
  const selectionReady =
    selectionSaved && selectedCalendarIds.length > 0 && selectedDriveFileIds.length > 0;
  function saveSelection() {
    sessionStorage.setItem(
      'source_scope_change_intent',
      JSON.stringify({ connectionId: connection.id, selectedCalendarIds, selectedDriveFileIds }),
    );
    setSavingSelection(true);
    setStatus('Selection changes require fresh MFA. Verify your identity to continue.');
    window.location.assign(
      '/mfa?returnTo=%2Fdata-sources%3Fresume%3Dsource_scope_change&job=connection_scope_change',
    );
  }
  const overallFreshness = latestFreshness(freshness, [
    'google_calendar',
    'google_drive',
    'google',
  ]);
  const freshnessState = googleFreshnessLabel(overallFreshness);
  const datasets = [
    { label: 'Google Calendar', sources: ['google_calendar'] },
    { label: 'Google Drive', sources: ['google_drive'] },
  ].map((dataset) => ({ ...dataset, row: latestFreshness(freshness, dataset.sources) }));
  async function syncNow() {
    setSyncing(true);
    setStatus('Requesting a secure Google sync…');
    const { response, body } = await runGoogleSync(connection.id);
    setSyncing(false);
    if (!response.ok) {
      setStatus(actionMessage(body.code, `Google sync failed (${body.code ?? response.status}).`));
      return;
    }
    setStatus('Google sync completed. Freshness has been updated.');
    router.refresh();
  }
  const googleRecoveryMessage =
    state.includes('denied') || overallFreshness?.state.includes('denied')
      ? 'Google permissions were denied. Reconnect and review each permission before trying another sync.'
      : state === 'reauthentication_required' || freshnessState === 'Needs attention'
        ? 'Google needs reauthentication. Reconnect to restore access; no retained data is deleted.'
        : 'Google data is stale or unavailable. Try Sync now; if the provider denied access, reconnect and review each permission.';
  return (
    <article className="card source-card" aria-labelledby={`google-${connection.id}`}>
      <div className="source-heading">
        <div>
          <div className="label">Personal Google data</div>
          <h3 id={`google-${connection.id}`}>{connection.account_label}</h3>
        </div>
        <span className={`status-pill status-${freshnessState.toLowerCase().replace(' ', '-')}`}>
          {state} · {freshnessState}
        </span>
      </div>
      <p>
        This is the only account used for selected Google Drive files, Calendar and Tasks. Choose
        the calendars and Drive files available to ingestion. Source sync never modifies Calendar
        events or Gmail; Planner writes Calendar events and Tasks through its separately approved
        action path.
      </p>
      <section aria-labelledby={`google-permissions-${connection.id}`}>
        <h4 id={`google-permissions-${connection.id}`}>Permissions and reasons</h4>
        <ul className="scope-list">
          {connection.scopes.length ? (
            connection.scopes.map((scope) => {
              const detail = googleScopeDetail(scope);
              return (
                <li key={scope}>
                  <strong>{detail.label}</strong>{' '}
                  <span className="scope-access">{detail.access}</span>
                  <span className="scope-reason"> — {detail.reason}</span>
                </li>
              );
            })
          ) : (
            <li>No scopes are recorded. Reconnect to request only the documented permissions.</li>
          )}
        </ul>
      </section>
      <section className="source-selection" aria-labelledby={`google-selection-${connection.id}`}>
        <h4 id={`google-selection-${connection.id}`}>Google source selection</h4>
        <p>
          Select the provider resources to ingest. Saving an empty selection intentionally means
          ingest none. The onboarding checklist requires at least one calendar and one Drive file
          before Google is considered ready.
        </p>
        {state !== 'connected' ? (
          <p>Reconnect Google before discovering calendars and Drive files.</p>
        ) : resourceState.status === 'loading' ? (
          <p aria-busy="true">Loading available calendars and Drive files…</p>
        ) : resourceState.status === 'error' ? (
          <div className="notice source-recovery" role="alert">
            <p>Google calendars and Drive files could not be loaded.</p>
            <dl className="source-error-meta">
              <div>
                <dt>Error code</dt>
                <dd>
                  <code>{resourceState.error?.code}</code>
                </dd>
              </div>
              {resourceState.error?.stage ? (
                <div>
                  <dt>Stage</dt>
                  <dd>
                    <code>{resourceState.error.stage}</code>
                  </dd>
                </div>
              ) : null}
              {resourceState.error?.reason ? (
                <div>
                  <dt>Reason</dt>
                  <dd>
                    <code>{resourceState.error.reason}</code>
                  </dd>
                </div>
              ) : null}
              {resourceState.error?.status ? (
                <div>
                  <dt>HTTP status</dt>
                  <dd>
                    <code>{resourceState.error.status}</code>
                  </dd>
                </div>
              ) : null}
              {resourceState.error?.requestId ? (
                <div>
                  <dt>Reference</dt>
                  <dd>
                    <code>{resourceState.error.requestId}</code>
                  </dd>
                </div>
              ) : null}
            </dl>
            <p>
              {actionMessage(
                resourceState.error?.code,
                'Retry resource discovery. If it fails again, provide the reference above to support.',
              )}
            </p>
            <button type="button" onClick={() => void loadResources()}>
              Retry resource discovery
            </button>
          </div>
        ) : resourceState.data ? (
          <>
            <fieldset>
              <legend>Calendars</legend>
              <div className="resource-list">
                {resourceState.data.calendars.length ? (
                  resourceState.data.calendars.map((calendar) => (
                    <label className="resource-item" key={calendar.id}>
                      <input
                        type="checkbox"
                        checked={selectedCalendarIds.includes(calendar.id)}
                        onChange={(event) => {
                          setSelectionSaved(false);
                          setSelectedCalendarIds((current) =>
                            event.target.checked
                              ? [...current, calendar.id]
                              : current.filter((id) => id !== calendar.id),
                          );
                        }}
                      />
                      <span>
                        {calendar.summary}
                        {calendar.primary ? ' (primary)' : ''}
                        {calendar.timeZone ? ` · ${calendar.timeZone}` : ''}
                      </span>
                    </label>
                  ))
                ) : (
                  <p>No calendars were returned. Reconnect Google and review Calendar access.</p>
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend>Drive files</legend>
              <div className="resource-list">
                {resourceState.data.driveFiles.length ? (
                  resourceState.data.driveFiles.map((file) => (
                    <label className="resource-item" key={file.id}>
                      <input
                        type="checkbox"
                        checked={selectedDriveFileIds.includes(file.id)}
                        onChange={(event) => {
                          setSelectionSaved(false);
                          setSelectedDriveFileIds((current) =>
                            event.target.checked
                              ? [...current, file.id]
                              : current.filter((id) => id !== file.id),
                          );
                        }}
                      />
                      <span>
                        {file.name} <small>{file.mimeType}</small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p>No Drive files were returned. Reconnect Google and review Drive access.</p>
                )}
              </div>
            </fieldset>
            <div className="source-selection-actions">
              <button type="button" onClick={() => void saveSelection()} disabled={savingSelection}>
                {savingSelection ? 'Waiting for MFA…' : 'Save selection (fresh MFA required)'}
              </button>
              <span>
                {selectionReady
                  ? `${selectedCalendarIds.length} calendar${selectedCalendarIds.length === 1 ? '' : 's'} and ${selectedDriveFileIds.length} Drive file${selectedDriveFileIds.length === 1 ? '' : 's'} selected.`
                  : 'Selection is not ready for Google freshness.'}
              </span>
            </div>
          </>
        ) : null}
      </section>
      <dl className="source-meta">
        <div>
          <dt>Last source activity</dt>
          <dd>{sourceDate(overallFreshness?.last_source_at ?? null)}</dd>
        </div>
        <div>
          <dt>Last successful sync</dt>
          <dd>{sourceDate(overallFreshness?.last_success_at ?? null)}</dd>
        </div>
        <div>
          <dt>Expected cadence</dt>
          <dd>{cadenceLabel(overallFreshness?.expected_cadence ?? null)}</dd>
        </div>
        <div>
          <dt>Freshness state</dt>
          <dd>{freshnessState}</dd>
        </div>
      </dl>
      <section aria-labelledby={`google-freshness-${connection.id}`}>
        <h4 id={`google-freshness-${connection.id}`}>Dataset freshness</h4>
        <div className="dataset-freshness">
          {datasets.map((dataset) => (
            <div className="dataset-freshness-item" key={dataset.label}>
              <strong>{dataset.label}</strong>
              <span>{freshnessLabel(dataset.row)}</span>
              <span>Last success: {sourceDate(dataset.row?.last_success_at ?? null)}</span>
              <span>Cadence: {cadenceLabel(dataset.row?.expected_cadence ?? null)}</span>
              {dataset.row?.stale_reason ? <span>Reason: {dataset.row.stale_reason}</span> : null}
            </div>
          ))}
        </div>
      </section>
      {freshnessState === 'Stale' ||
      freshnessState === 'Needs attention' ||
      state !== 'connected' ? (
        <p className="notice source-recovery" role="status">
          {googleRecoveryMessage}
        </p>
      ) : null}
      <p>
        <strong>Account role:</strong> Personal data source · {connection.environment}.
      </p>
      <p>
        <strong>Affected workflows:</strong> Personal planning, Career evidence and selected Drive
        ingestion.
      </p>
      <div className="source-actions">
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={
            syncing || revokeFlow.busy || revoked || state !== 'connected' || !selectionReady
          }
        >
          {syncing ? 'Syncing…' : 'Google Sync now'}
        </button>
        <GoogleConnect label="Reconnect personal Google data" role="personal_data_source" />
        <button type="button" onClick={revokeFlow.revoke} disabled={revokeFlow.busy || revoked}>
          {revokeFlow.confirming ? 'Confirm Google revoke' : 'Revoke Google'}
        </button>
      </div>
      {!selectionReady && state === 'connected' ? (
        <p className="notice source-recovery" role="status">
          Save at least one calendar and one selected Drive file to enable Google Sync now and
          satisfy source readiness. An empty saved selection remains valid configuration but ingests
          nothing.
        </p>
      ) : null}
      <p aria-live="polite">{status}</p>
    </article>
  );
}

function GoogleMailboxCard({ connection }: Readonly<{ connection: Connection }>) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [revoked, setRevoked] = useState(connection.status === 'revoked');
  const completeRevoke = useCallback(() => {
    setRevoked(true);
    router.refresh();
  }, [router]);
  const onRevokeStatus = useCallback((value: string) => setStatus(value), []);
  const revokeFlow = useRevokeFlow(connection.id, 'google', completeRevoke, onRevokeStatus);
  const legacy = connection.account_role === 'legacy_combined';
  const role =
    connection.account_role === 'ai_operations_mailbox_staging'
      ? 'ai_operations_mailbox_staging'
      : 'ai_operations_mailbox';
  const state = revoked ? 'revoked' : connection.status;
  return (
    <article className="card source-card" aria-labelledby={`google-mailbox-${connection.id}`}>
      <div className="source-heading">
        <div>
          <div className="label">
            {legacy ? 'Legacy combined Google grant' : 'AI Operations communication mailbox'}
          </div>
          <h3 id={`google-mailbox-${connection.id}`}>{connection.account_label}</h3>
        </div>
        <span className={`status-pill status-${state.toLowerCase().replaceAll('_', '-')}`}>
          {state} · {connection.environment}
        </span>
      </div>
      <p>
        {legacy
          ? 'This previous combined grant is disabled until revoked and reconnected through the separate least-privilege account roles.'
          : 'This mailbox is used for AI Operations conversations and outbound replies. It has Gmail-only access; Drive, Calendar and Tasks remain on the Personal Google data connection.'}
      </p>
      <section aria-labelledby={`google-mailbox-permissions-${connection.id}`}>
        <h4 id={`google-mailbox-permissions-${connection.id}`}>Permissions and reasons</h4>
        <ul className="scope-list">
          {connection.scopes.map((scope) => {
            const detail = googleScopeDetail(scope);
            return (
              <li key={scope}>
                <strong>{detail.label}</strong>{' '}
                <span className="scope-access">{detail.access}</span>
                <span className="scope-reason"> — {detail.reason}</span>
              </li>
            );
          })}
        </ul>
      </section>
      {legacy ? (
        <p className="notice source-recovery" role="status">
          The previous combined Google grant has been disabled. Revoke AI Operations in the Google
          Account security page, then connect this communication mailbox with Gmail-only access.
        </p>
      ) : null}
      <div className="source-actions">
        {!legacy ? <GoogleConnect label="Connect or reconnect mailbox" role={role} /> : null}
        <button type="button" onClick={revokeFlow.revoke} disabled={revokeFlow.busy || revoked}>
          {revokeFlow.confirming ? 'Confirm mailbox revoke' : 'Revoke mailbox'}
        </button>
      </div>
      <p aria-live="polite">{status}</p>
    </article>
  );
}

export function AppleSourceCard({
  device,
  freshness,
}: Readonly<{ device: AppleDevice; freshness: SourceFreshness[] }>) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [revoked, setRevoked] = useState(Boolean(device.revoked_at));
  const completeRevoke = useCallback(() => {
    setRevoked(true);
    router.refresh();
  }, [router]);
  const onRevokeStatus = useCallback((value: string) => setStatus(value), []);
  const revokeFlow = useRevokeFlow(device.id, 'apple', completeRevoke, onRevokeStatus);
  const datasets = [
    { label: 'Apple Calendar', sources: ['apple_calendar', 'apple'] },
    { label: 'Apple Reminders', sources: ['apple_reminders', 'apple_bridge'] },
    { label: 'Apple Health', sources: ['apple_health'] },
    { label: 'Apple Location', sources: ['apple_location'] },
    { label: 'Apple Screen Time', sources: ['apple_screen_time'] },
  ].map((dataset) => ({ ...dataset, row: latestFreshness(freshness, dataset.sources) }));
  const overallFreshness = latestFreshness(freshness, [
    'apple',
    'apple_bridge',
    'apple_health',
    'apple_calendar',
    'apple_reminders',
    'apple_location',
    'apple_screen_time',
  ]);
  const sourceFreshness = freshnessLabel(overallFreshness);
  const state = revoked ? 'revoked' : device.revoked_at ? 'revoked' : 'active';
  return (
    <article className="card source-card" aria-labelledby={`apple-${device.id}`}>
      <div className="source-heading">
        <div>
          <div className="label">Apple Shortcut bridge</div>
          <h3 id={`apple-${device.id}`}>{device.label}</h3>
        </div>
        <span className={`status-pill status-${sourceFreshness.toLowerCase().replace(' ', '-')}`}>
          {state} · {sourceFreshness}
        </span>
      </div>
      <p>
        Calendar and selected Reminder lists are imported through this device bridge. The token is
        never shown again after setup.
      </p>
      <dl className="source-meta">
        <div>
          <dt>Permissions</dt>
          <dd>
            Calendar; Reminders:{' '}
            {device.enabled_lists.length ? device.enabled_lists.join(', ') : 'none selected'}
          </dd>
        </div>
        <div>
          <dt>Last successful snapshot</dt>
          <dd>{sourceDate(overallFreshness?.last_success_at ?? null)}</dd>
        </div>
        <div>
          <dt>Last device seen</dt>
          <dd>{sourceDate(device.last_seen_at)}</dd>
        </div>
        <div>
          <dt>Expected cadence</dt>
          <dd>{cadenceLabel(overallFreshness?.expected_cadence ?? null)}</dd>
        </div>
        <div>
          <dt>Freshness state</dt>
          <dd>{sourceFreshness}</dd>
        </div>
      </dl>
      <section aria-labelledby={`apple-freshness-${device.id}`}>
        <h4 id={`apple-freshness-${device.id}`}>Dataset freshness</h4>
        <div className="dataset-freshness">
          {datasets.map((dataset) => (
            <div className="dataset-freshness-item" key={dataset.label}>
              <strong>{dataset.label}</strong>
              <span>{freshnessLabel(dataset.row)}</span>
              <span>Last success: {sourceDate(dataset.row?.last_success_at ?? null)}</span>
              <span>Cadence: {cadenceLabel(dataset.row?.expected_cadence ?? null)}</span>
              {dataset.row?.stale_reason ? <span>Reason: {dataset.row.stale_reason}</span> : null}
            </div>
          ))}
        </div>
      </section>
      {state === 'revoked' ? (
        <p className="notice source-recovery" role="status">
          This Apple bridge is revoked. Create a new bridge if you need to resume snapshots;
          retained data remains available.
        </p>
      ) : sourceFreshness !== 'Fresh' ? (
        <p className="notice source-recovery" role="status">
          No recent Apple snapshot is available. Run the Shortcut again, check its selected lists,
          and create a new bridge only if the device token was lost.
        </p>
      ) : null}
      <p>
        <strong>Affected workflows:</strong> Personal planning, Health ingestion, and approved AI
        Actions.
      </p>
      <div className="source-actions">
        <button type="button" onClick={revokeFlow.revoke} disabled={revokeFlow.busy || revoked}>
          {revokeFlow.confirming ? 'Confirm Apple revoke' : 'Revoke Apple bridge'}
        </button>
      </div>
      <p aria-live="polite">{status}</p>
    </article>
  );
}

export function SourceSummary({
  connections,
  appleDevices,
  freshness,
}: Readonly<{
  connections: Connection[];
  appleDevices: AppleDevice[];
  freshness: SourceFreshness[];
}>) {
  const google = useMemo(
    () => connections.filter((item) => item.provider === 'google'),
    [connections],
  );
  const personalGoogle = google.filter((item) => item.account_role === 'personal_data_source');
  const currentMailboxRole =
    personalGoogle[0]?.environment === 'staging'
      ? 'ai_operations_mailbox_staging'
      : 'ai_operations_mailbox';
  const mailbox = google.filter((item) => item.account_role === currentMailboxRole);
  const legacyGoogle = google.filter((item) => item.account_role === 'legacy_combined');
  return (
    <>
      <h2>Personal Google data</h2>
      <div className="stack">
        {personalGoogle.map((connection) => (
          <GoogleSourceCard key={connection.id} connection={connection} freshness={freshness} />
        ))}
      </div>
      {!personalGoogle.length ? (
        <div className="card source-card">
          <h3>No personal Google data account is connected.</h3>
          <p>
            Connect the canonical personal account for selected Drive files, Google Calendar and
            Google Tasks. Gmail access is not requested for this role.
          </p>
          <GoogleConnect label="Connect personal Google data" role="personal_data_source" />
        </div>
      ) : null}
      <h2>AI Operations communication mailbox</h2>
      <div className="stack">
        {mailbox.map((connection) => (
          <GoogleMailboxCard key={connection.id} connection={connection} />
        ))}
      </div>
      {!mailbox.length ? (
        <div className="card source-card">
          <h3>No AI Operations mailbox is connected.</h3>
          <p>
            Connect the Gmail-only mailbox for this deployment. Production and staging use separate
            account roles, tokens and databases.
          </p>
          {personalGoogle.length ? (
            <GoogleConnect label="Connect AI Operations mailbox" role={currentMailboxRole} />
          ) : (
            <p>
              Connect the personal Google data account first so the deployment environment can be
              verified.
            </p>
          )}
        </div>
      ) : null}
      {legacyGoogle.map((connection) => (
        <GoogleMailboxCard key={connection.id} connection={connection} />
      ))}
      <h2>Apple Shortcut bridge</h2>
      <div className="stack">
        {appleDevices.map((device) => (
          <AppleSourceCard key={device.id} device={device} freshness={freshness} />
        ))}
      </div>
      {!appleDevices.length ? (
        <p className="card">
          No Apple Shortcut bridge device is registered. Set up a device below to import Calendar
          and selected Reminder lists.
        </p>
      ) : null}
    </>
  );
}
