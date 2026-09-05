import { sourcePermissionsData } from '../../../lib/platform-data';
import { AppleBridgeSetup } from './apple-bridge-setup';
import { GoogleOAuthStatus } from './google-oauth-status';
import { SourceSummary } from './source-permission-card';

type DataSourcesSearchParams = Readonly<{
  google?: string;
  code?: string;
  detail?: string;
  requestId?: string;
}>;

export default async function DataSourcesPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<DataSourcesSearchParams> }>) {
  const { connections, freshness, appleDevices } = await sourcePermissionsData();
  const error = connections.error ?? freshness.error ?? appleDevices.error;
  const params = (await searchParams) ?? {};
  return (
    <>
      <h1>Data Sources</h1>
      {params.google === 'error' ? (
        <GoogleOAuthStatus code={params.code} detail={params.detail} requestId={params.requestId} />
      ) : null}
      <p className="notice">
        Connections use server-side credentials. The browser never receives refresh tokens or Apple
        Shortcut device tokens after their one-time setup display. Revoke actions require fresh MFA.
      </p>
      {error ? (
        <p role="alert" className="notice">
          {error} Refresh the page and retry. Existing retained data is not changed by a read error.
        </p>
      ) : null}
      <SourceSummary
        connections={connections.data}
        appleDevices={appleDevices.data}
        freshness={freshness.data}
      />
      <section aria-labelledby="apple-setup-heading">
        <h2 id="apple-setup-heading">Set up Apple Shortcut bridge</h2>
        <div className="card">
          <p>
            Create a device token from the secure bridge setup, paste it into the Shortcut once, and
            send Calendar and mapped Reminder snapshots. A revoked token cannot be used again.
          </p>
          <AppleBridgeSetup />
        </div>
      </section>
    </>
  );
}
