export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const error = (await searchParams)?.error;
  return (
    <main style={{ maxWidth: 480, paddingTop: '12vh' }}>
      <h1>AI Operations</h1>
      <p className="label">Secure sign-in is required.</p>
      {error === 'invalid' && <p role="alert">The email or password was not accepted.</p>}
      {error === 'security' && (
        <p role="alert">
          This sign-in request was rejected by the security policy. Reload this page and try again.
        </p>
      )}
      <form className="card" action="/api/auth/sign-in" method="post">
        <label>
          Email
          <input aria-label="Email" name="email" type="email" required autoComplete="email" />
        </label>
        <br />
        <label>
          Password
          <input
            aria-label="Password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <p>
          <button type="submit">Sign in</button>
        </p>
        <small className="label">
          Only the allowlisted account can continue. Multi-factor authentication is required.
        </small>
      </form>
    </main>
  );
}
