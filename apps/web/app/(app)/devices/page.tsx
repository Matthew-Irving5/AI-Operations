import { digitalEstateData } from '../../../lib/platform-data';
import { DeviceManager } from './device-manager';

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
      {!devices.data.length && <p className="card">No registered device yet.</p>}
      <DeviceManager
        devices={devices.data}
        scans={scans.data}
        currentTimeMs={new Date().getTime()}
      />
    </>
  );
}
