import type { ReactNode } from 'react';
import React from 'react';
import { Alert, Heading, Text } from './primitives';

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-live="polite" className="ui-empty-state">
      <Heading level={3}>{title}</Heading>
      <Text tone="secondary">{children}</Text>
    </section>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Alert className="ui-error-state" tone="danger" title="Something went wrong">
      {message}
    </Alert>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="ui-loading-state" role="status">
      <span aria-hidden="true" className="ui-spinner" />
      <span>{label}…</span>
    </div>
  );
}
