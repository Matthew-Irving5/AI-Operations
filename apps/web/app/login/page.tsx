export default function Login() {
  return (
    <main style={{ maxWidth: 480, paddingTop: '12vh' }}>
      <h1>AI Operations</h1>
      <p className="label">Secure sign-in is required.</p>
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
