import { connectionsData } from '../../../lib/platform-data';
import { GoogleConnect } from './google-connect';

export default async function DataSourcesPage() {
  const connections = await connectionsData();
  const google = connections.data.filter((connection) => connection.provider === 'google');
  return (
    <>
      <h1>Data Sources</h1>
      <p className="notice">
        Connections use server-side credentials. The browser never receives refresh tokens or Apple
        Shortcut device tokens after their one-time setup display.
      </p>
      {connections.error ? (
        <p role="alert" className="notice">
          {connections.error}
        </p>
      ) : null}
      <h2>Google</h2>
      {google.map((connection) => (
        <article className="card" key={connection.id}>
          <div className="label">Google · {connection.status}</div>
          <h3>{connection.account_label}</h3>
          <p>
            Scopes: {connection.scopes.length ? connection.scopes.join(', ') : 'none recorded'}.
          </p>
          <p>
            Freshness is recorded after each successful incremental sync. Reconnect if this
            connection requires reauthentication.
          </p>
        </article>
      ))}
      {!google.length ? (
        <p className="card">
          No Google account is connected. Start secure OAuth after configuring the server-side
          Google client.
          <br />
          <br />
          <GoogleConnect />
        </p>
      ) : null}
      <h2>Apple Shortcut bridge</h2>
      <p className="card">
        Create a device token from the secure bridge setup, paste it into the Shortcut once, and
        send Calendar and mapped Reminder snapshots. A revoked token cannot be used again.
      </p>
    </>
  );
}
