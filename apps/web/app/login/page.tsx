import Link from 'next/link';

export default async function Login({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; password?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error;
  return (
    <main style={{ maxWidth: 480, paddingTop: '12vh' }}>
      <h1>AI Operations</h1>
      <p className="label">Secure sign-in is required.</p>
      {params?.password === 'updated' && (
        <p role="status">Your password was updated and your other sessions were signed out.</p>
      )}
      {error === 'invalid' && <p role="alert">The email or password was not accepted.</p>}
      {error === 'recovery' && (
        <p role="alert">
          This recovery link is invalid or expired. Request a new password reset link.
        </p>
      )}
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
      <p>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
    </main>
  );
}
