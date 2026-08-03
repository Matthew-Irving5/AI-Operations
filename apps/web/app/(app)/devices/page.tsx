import { digitalEstateData } from '../../../lib/platform-data';

export default async function DevicesPage() {
  const { devices, scans } = await digitalEstateData();
  return (
    <>
      <h1>Devices</h1>
      <p className="notice">
        Only fresh-MFA registration may pair or revoke a Windows worker. Device private keys are
        DPAPI-protected locally and never enter the browser.
      </p>
      {(devices.error ?? scans.error) ? (
        <p className="notice" role="alert">
          {devices.error ?? scans.error}
        </p>
      ) : null}
      {devices.data.length ? (
        <section className="stack">
          {devices.data.map((device) => (
            <article className="card" key={device.id}>
              <h2>{device.label}</h2>
              <p>
                {device.state}; last heartbeat{' '}
                {device.last_heartbeat_at
                  ? new Date(device.last_heartbeat_at).toLocaleString('en-GB', {
                      timeZone: 'Europe/London',
                    })
                  : 'not received'}
                .
              </p>
            </article>
          ))}
        </section>
      ) : (
        <p className="card">
          No registered device. Register a Windows worker in Digital Estate after fresh MFA.
        </p>
      )}
    </>
  );
}
