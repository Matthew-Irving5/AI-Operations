import { googleOAuthErrorView } from './google-oauth-error';

export function GoogleOAuthStatus(
  props: Readonly<{
    code?: string | undefined;
    detail?: string | undefined;
    requestId?: string | undefined;
  }>,
) {
  const view = googleOAuthErrorView(props);
  if (!view) return null;
  return (
    <section
      className="notice source-oauth-error"
      role="alert"
      aria-labelledby="google-oauth-error-title"
    >
      <h2 id="google-oauth-error-title">{view.title}</h2>
      <p>{view.message}</p>
      <p>{view.action}</p>
      <dl className="source-error-meta">
        <div>
          <dt>Error code</dt>
          <dd>
            <code>{view.code}</code>
          </dd>
        </div>
        {view.requestId ? (
          <div>
            <dt>Reference</dt>
            <dd>
              <code>{view.requestId}</code>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
