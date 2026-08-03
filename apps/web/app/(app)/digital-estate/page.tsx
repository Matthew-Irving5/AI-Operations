import { digitalEstateData } from '../../../lib/platform-data';
import { DigitalScanForm } from './scan-form';

export default async function DigitalEstatePage() {
  const { scans, devices } = await digitalEstateData();
  return (
    <>
      <h1>Digital Estate</h1>
      <p className="notice">
        The Windows worker is outbound-only. It reads only approved roots, excludes sensitive and
        work paths, and executes only fresh-MFA-approved signed manifests.
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
            {devices.data.filter((device) => device.state !== 'revoked').length}
          </div>
        </article>
        <article className="card">
          <div className="label">Recent scans</div>
          <div className="value">{scans.data.length}</div>
        </article>
      </section>
      <h2>Worker devices</h2>
      {devices.data.length ? (
        <section className="stack">
          {devices.data.map((device) => (
            <article className="card" key={device.id}>
              <h3>{device.label}</h3>
              <p>
                {device.state}; last heartbeat{' '}
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
      {devices.data.find((device) => device.state !== 'revoked') ? (
        <DigitalScanForm deviceId={devices.data.find((device) => device.state !== 'revoked')!.id} />
      ) : null}
      {scans.data.length ? (
        <section className="stack">
          {scans.data.map((scan) => (
            <article className="card" key={scan.id}>
              <h3>{scan.scan_kind} scan</h3>
              <p>
                {scan.status}; {scan.progress}% complete.
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No scan has been requested. Deep scans require an individual hard cap, selected approved
          roots, and an online paired worker.
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
