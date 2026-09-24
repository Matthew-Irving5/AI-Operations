import {
  digitalEstateData,
  financeMappingReadinessData,
  onboardingData,
  personalProfileReadinessData,
  sourcePermissionsData,
} from '../../../lib/platform-data';
import { OnboardingForm } from './onboarding-form';
import { freshnessLabel } from '../data-sources/source-permissions';

export default async function SettingsPage() {
  const [{ items, accepted }, sources, digitalEstate, personalProfile, financeMapping] =
    await Promise.all([
      onboardingData(),
      sourcePermissionsData(),
      digitalEstateData(),
      personalProfileReadinessData(),
      financeMappingReadinessData(),
    ]);
  const freshnessBySource = new Map(sources.freshness.data.map((item) => [item.source, item]));
  const googleConnections = sources.connections.data.filter(
    (connection) => connection.provider === 'google' && connection.status === 'connected',
  );
  const googleSelectionsReady = googleConnections.every((connection) => {
    const configuration = connection.configuration ?? {};
    const calendars = configuration.selected_calendar_ids;
    const driveFiles = configuration.selected_drive_file_ids;
    return (
      Array.isArray(calendars) &&
      calendars.length > 0 &&
      calendars.every((value) => typeof value === 'string') &&
      Array.isArray(driveFiles) &&
      driveFiles.length > 0 &&
      driveFiles.every((value) => typeof value === 'string')
    );
  });
  const activeAppleDevices = sources.appleDevices.data.filter((device) => !device.revoked_at);
  const googleReady =
    googleConnections.length > 0 &&
    googleSelectionsReady &&
    ['google_gmail', 'google_calendar', 'google_drive'].every(
      (source) => freshnessLabel(freshnessBySource.get(source)) === 'Fresh',
    );
  const appleReady =
    activeAppleDevices.length > 0 &&
    [
      'apple_health',
      'apple_calendar',
      'apple_reminders',
      'apple_location',
      'apple_screen_time',
    ].every((source) => freshnessLabel(freshnessBySource.get(source)) === 'Fresh');
  const sourcePermissionsReady =
    (googleConnections.length > 0 || activeAppleDevices.length > 0) &&
    (googleConnections.length === 0 || googleReady) &&
    (activeAppleDevices.length === 0 || appleReady);
  const heartbeatCutoff = new Date().getTime() - 30 * 60_000;
  const pairedWorkerIds = new Set(
    digitalEstate.devices.data
      .filter(
        (device) =>
          device.state !== 'revoked' &&
          !device.revoked_at &&
          Boolean(device.paired_at) &&
          Boolean(device.last_heartbeat_at) &&
          Date.parse(device.last_heartbeat_at!) >= heartbeatCutoff,
      )
      .map((device) => device.id),
  );
  const windowsWorkerReady = digitalEstate.scans.data.some(
    (scan) =>
      pairedWorkerIds.has(scan.device_id) &&
      scan.scan_kind === 'lightweight' &&
      scan.status === 'complete' &&
      Boolean(scan.completed_at) &&
      Boolean(scan.result_verified_at),
  );
  return (
    <>
      <h1>Settings &amp; production onboarding</h1>
      <p className="notice">
        Complete this checklist using real production setup evidence. Credentials and keys are never
        entered into this page; they remain environment or provider secrets.
      </p>
      {(items.error ??
      accepted.error ??
      sources.connections.error ??
      sources.freshness.error ??
      sources.appleDevices.error ??
      digitalEstate.devices.error ??
      digitalEstate.scans.error ??
      personalProfile.error ??
      financeMapping.error) ? (
        <p className="notice" role="alert">
          {items.error ??
            accepted.error ??
            sources.connections.error ??
            sources.freshness.error ??
            sources.appleDevices.error ??
            digitalEstate.devices.error ??
            digitalEstate.scans.error ??
            personalProfile.error ??
            financeMapping.error}
        </p>
      ) : null}
      <OnboardingForm
        completedCodes={items.data.filter((item) => item.completed_at).map((item) => item.code)}
        accepted={accepted.data}
        sourcePermissionsReady={sourcePermissionsReady}
        windowsWorkerReady={windowsWorkerReady}
        personalProfileReady={personalProfile.ready}
        financeMappingReady={financeMapping.ready}
      />
    </>
  );
}
