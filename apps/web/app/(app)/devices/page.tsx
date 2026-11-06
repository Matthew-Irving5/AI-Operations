import { digitalEstateData } from '../../../lib/platform-data';
import { workerStartCommand } from '../../../lib/worker-start-command';
import { DeviceManager } from './device-manager';

export default async function DevicesPage() {
  const { devices } = await digitalEstateData();
  return (
    <>
      <h1>Devices</h1>
      <p className="notice">
        Only fresh-MFA registration may pair or revoke a Windows worker. Device private keys are
        DPAPI-protected locally and never enter the browser.
      </p>
      {devices.error ? (
        <p className="notice" role="alert">
          {devices.error}
        </p>
      ) : null}
      {!devices.data.length && <p className="card">No registered device yet.</p>}
      <DeviceManager
        devices={devices.data}
        currentTimeMs={new Date().getTime()}
        workerStartCommand={workerStartCommand(process.env.APP_ENV)}
      />
    </>
  );
}
