import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState, ErrorState, LoadingState } from './states';

describe('shared UI states', () => {
  it('renders empty, error and loading states with useful accessible semantics', () => {
    const empty = renderToStaticMarkup(
      createElement(EmptyState, {
        title: 'No runs',
        children: 'Launch a workflow to see results.',
      }),
    );
    const error = renderToStaticMarkup(
      createElement(ErrorState, { message: 'The service is offline.' }),
    );
    const loading = renderToStaticMarkup(createElement(LoadingState));

    expect(empty).toContain('No runs');
    expect(empty).toContain('Launch a workflow');
    expect(error).toContain('role="alert"');
    expect(error).toContain('The service is offline.');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
  });
});
