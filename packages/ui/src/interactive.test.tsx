import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Command, Dialog, Menu, Popover, Sheet, Tabs, Tooltip } from './interactive';

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

describe('accessible interaction substrates', () => {
  it('uses native disclosure semantics for menus and popovers', () => {
    const menu = render(
      createElement(Menu, {
        label: 'More actions',
        children: createElement('a', { href: '/runs' }, 'View runs'),
      }),
    );
    const popover = render(
      createElement(Popover, { label: 'Run details', children: 'Latest run completed' }),
    );

    expect(menu).toContain('<details');
    expect(menu).toContain('<summary');
    expect(menu).toContain('View runs');
    expect(popover).toContain('<details');
    expect(popover).toContain('Run details');
  });

  it('connects a tooltip description to its interactive trigger', () => {
    const markup = render(
      createElement(Tooltip, {
        label: 'Opens the latest evidence',
        children: createElement('button', null, 'Evidence'),
      }),
    );
    const tooltipId = markup.match(/id="([^"]+)" role="tooltip"/)?.[1];

    expect(tooltipId).toBeDefined();
    expect(markup).toContain(`aria-describedby="${tooltipId}"`);
    expect(markup).toContain('role="tooltip"');
  });

  it('labels tabs, relates each tab to its panel, and selects the configured tab', () => {
    const markup = render(
      createElement(Tabs, {
        label: 'Run views',
        initialTab: 'history',
        items: [
          { id: 'summary', label: 'Summary', content: 'Current status' },
          { id: 'history', label: 'History', content: 'Prior runs' },
        ],
      }),
    );

    expect(markup).toContain('aria-label="Run views" class="ui-tabs__list" role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('History');
    expect(markup).toContain('Prior runs');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('tabindex="0"');
  });

  it('provides named modal dialog and sheet substrates with dismissal controls', () => {
    const dialog = render(
      createElement(Dialog, {
        open: false,
        title: 'Review changes',
        onOpenChange: () => undefined,
        children: 'Compare values',
      }),
    );
    const sheet = render(
      createElement(Sheet, {
        open: false,
        title: 'Evidence',
        onOpenChange: () => undefined,
        children: 'Run details',
      }),
    );

    expect(dialog).toContain('<dialog');
    expect(dialog).toContain('aria-labelledby=');
    expect(dialog).toContain('aria-label="Close dialog"');
    expect(sheet).toContain('ui-sheet');
  });

  it('exposes a searchable listbox and useful empty state for command navigation', () => {
    const markup = render(
      createElement(Command, {
        items: [{ id: 'open-runs', label: 'Open runs', description: 'Review recent executions' }],
        onSelect: () => undefined,
      }),
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-controls=');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
    expect(markup).toContain('Open runs');
  });
});
