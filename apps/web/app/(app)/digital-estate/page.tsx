import { digitalEstateData } from '../../../lib/platform-data';
import { DigitalScanForm } from './scan-form';

export default async function DigitalEstatePage() {
  const { scans, devices, summary } = await digitalEstateData();
  const visibleDevices = devices.data.filter((device) => device.state !== 'revoked');
  const cutoff = Date.now() - 30 * 24 * 60 * 60_000;
  const visibleScans = scans.data.filter((scan) => {
    if (scan.status === 'cancelled') return false;
    if (scan.status === 'complete' && scan.completed_at && Date.parse(scan.completed_at) < cutoff) return false;
    return !(scan.status !== 'complete' && Date.parse(scan.created_at) < cutoff);
  });
  return (
    <>
      <h1>Digital Estate</h1>
      <p className="notice">
        The Windows worker is outbound-only. Start it from Devices before queueing a scan; paused
        workers remain online for control but do not poll.
      </p>
      {(scans.error ?? devices.error) ? (
        <p className="notice" role="alert">
          {scans.error ?? devices.error}
        </p>
      ) : null}
      <section className="grid" aria-label="Digital Estate status">
        <article className="card">
          <div className="label">Paired devices</div>
          <div className="value">
            {summary.pairedDevices}
          </div>
        </article>
        <article className="card">
          <div className="label">Total scans</div>
          <div className="value">{summary.totalScans}</div>
        </article>
        <article className="card">
          <div className="label">Last 30 days</div>
          <div className="value">{summary.last30DaysScans}</div>
        </article>
        <article className="card">
          <div className="label">Pending scans</div>
          <div className="value">{summary.pendingScans}</div>
        </article>
      </section>
      <h2>Worker devices</h2>
      {visibleDevices.length ? (
        <section className="stack">
          {visibleDevices.map((device) => (
            <article className="card" key={device.id}>
              <h3>{device.label}</h3>
              <p className={`worker-status worker-status-${device.state}`}><strong>{device.state}</strong>; last heartbeat{' '}
                {device.last_heartbeat_at
                  ? new Date(device.last_heartbeat_at).toLocaleString('en-GB')
                  : 'not received'}
                .
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No worker is paired. Pairing requires fresh MFA and a short-lived one-time code.
        </p>
      )}
      <h2>Scan history</h2>
      {visibleDevices[0] ? (
        <DigitalScanForm deviceId={visibleDevices[0].id} />
      ) : null}
      {visibleScans.length ? (
        <section className="stack">
          {visibleScans.map((scan) => (
            <article className="card" key={scan.id}>
              <h3>{scan.scan_kind} scan</h3>
              <p className={`scan-status scan-status-${scan.status}`}><strong>{scan.status}</strong></p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No scan has been requested. Deep scans require an individual hard cap, selected approved
          roots, and a connected paired worker.
        </p>
      )}
      <p className="card">
        Plans remain proposals until fresh MFA approves an immutable payload. Deletion is never
        immediate: files are quarantined first, and any purge needs a separate approval after 30
        days.
      </p>
    </>
  );
}
