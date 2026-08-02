import type { ReactNode } from 'react';
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-live="polite">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
export function ErrorState({ message }: { message: string }) {
  return (
    <section role="alert">
      <h2>Something went wrong</h2>
      <p>{message}</p>
    </section>
  );
}
export function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading">
      Loading…
    </div>
  );
}
