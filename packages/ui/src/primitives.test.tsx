import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Alert,
  Button,
  Heading,
  IconButton,
  Split,
  Stack,
  Status,
  Surface,
  Text,
  TextArea,
  TextField,
} from './primitives';
import { EmptyState, ErrorState, LoadingState } from './states';

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

describe('semantic design-system primitives', () => {
  it('uses explicit action styles and never leaves a button submit-capable by default', () => {
    const markup = render(createElement(Button, { variant: 'secondary' }, 'Review changes'));

    expect(markup).toContain('type="button"');
    expect(markup).toContain('data-ui="button"');
    expect(markup).toContain('ui-button--secondary');
  });

  it('requires an accessible name for icon-only actions', () => {
    const markup = render(
      createElement(IconButton, {
        label: 'Close panel',
        'aria-label': 'Unlabelled action',
        type: 'submit',
        children: '×',
      }),
    );

    expect(markup).toContain('aria-label="Close panel"');
    expect(markup).toContain('data-ui="icon-button"');
    expect(markup).toContain('type="button"');
  });

  it('connects a field error to its control and marks the invalid state', () => {
    const markup = render(
      createElement(TextField, {
        label: 'Display name',
        error: 'Enter a name no longer than 80 characters.',
      }),
    );
    const id = markup.match(/id="(field-[^"]+)"/)?.[1];

    expect(id).toBeDefined();
    expect(markup).toContain(`for="${id}"`);
    expect(markup).toContain(`aria-describedby="${id}-error"`);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain(`id="${id}-error"`);
  });

  it('keeps both hint and error descriptions present when a field is invalid', () => {
    const markup = render(
      createElement(TextField, {
        label: 'Approval reference',
        hint: 'Use the reference from the review request.',
        error: 'Enter a valid reference.',
      }),
    );
    const id = markup.match(/id="(field-[^"]+)"/)?.[1];

    expect(markup).toContain(`aria-describedby="${id}-hint ${id}-error"`);
    expect(markup).toContain('Use the reference from the review request.');
    expect(markup).toContain('Enter a valid reference.');
  });

  it('makes status text explicit and alerts assertive only for danger', () => {
    const warning = render(createElement(Status, { tone: 'warning' }, 'Waiting for Google'));
    const danger = render(
      createElement(Alert, { tone: 'danger', title: 'Sync failed' }, 'Retry available'),
    );
    const info = render(createElement(Alert, { tone: 'info' }, 'Data is current'));

    expect(warning).toContain('Waiting for Google');
    expect(warning).toContain('ui-status--warning');
    expect(danger).toContain('role="alert"');
    expect(info).toContain('role="status"');
  });

  it('keeps layout, surfaces and state fixtures semantic and composable', () => {
    expect(render(createElement(Heading, { level: 3, children: 'A useful heading' }))).toContain(
      '<h3',
    );
    expect(render(createElement(Text, { tone: 'secondary', children: 'Context' }))).toContain(
      'ui-text--secondary',
    );
    expect(
      render(createElement(Surface, { variant: 'subtle', children: 'Source health' })),
    ).toContain('<section');
    expect(render(createElement(Stack, { space: 12, children: 'Items' }))).toContain('ui-space-12');
    expect(
      render(createElement(Split, { aside: '22rem', children: ['Main', 'Context'] })),
    ).toContain('ui-split--22');
    expect(
      render(
        createElement(EmptyState, {
          title: 'No schedules',
          children: 'Create a schedule to see it here.',
        }),
      ),
    ).toContain('<h3');
    expect(
      render(createElement(ErrorState, { message: 'The provider is unavailable.' })),
    ).toContain('role="alert"');
    expect(render(createElement(LoadingState, { label: 'Loading runs' }))).toContain(
      'aria-busy="true"',
    );
  });

  it('associates textarea descriptions with the correct field', () => {
    const markup = render(
      createElement(TextArea, { label: 'Reason', hint: 'Explain the change.' }),
    );
    const id = markup.match(/id="(textarea-[^"]+)"/)?.[1];

    expect(markup).toContain(`for="${id}"`);
    expect(markup).toContain(`aria-describedby="${id}-hint"`);
    expect(markup).toContain(`id="${id}-hint"`);
  });
});
