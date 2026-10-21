'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Command, Dialog, ThemeToggle } from '@ai-operations/ui';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SessionActivity } from './session-activity';
import {
  commandProviders,
  navigationDestinations,
  navigationGroups,
  type CommandPaletteItem,
} from './navigation';

const navigationPreferenceKey = 'ai-operations.navigation.collapsed.v1';
const navigationPreferenceEvent = 'ai-operations:navigation-preference-change';
let navigationCollapsedFallback = false;

function readNavigationCollapsed() {
  try {
    const preference = window.localStorage.getItem(navigationPreferenceKey);
    navigationCollapsedFallback = preference === 'true';
  } catch {
    // Keep the in-memory preference when browser storage is unavailable.
  }
  return navigationCollapsedFallback;
}

function subscribeToNavigationPreference(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(navigationPreferenceEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(navigationPreferenceEvent, onChange);
  };
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const navigationCollapsed = useSyncExternalStore(
    subscribeToNavigationPreference,
    readNavigationCollapsed,
    () => false,
  );
  const setNavigationCollapsed = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    navigationCollapsedFallback =
      typeof next === 'function' ? next(readNavigationCollapsed()) : next;
    try {
      window.localStorage.setItem(navigationPreferenceKey, String(navigationCollapsedFallback));
    } catch {
      // The rail remains usable when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(navigationPreferenceEvent));
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteItems = useMemo<CommandPaletteItem[]>(
    () => commandProviders.flatMap((provider) => provider.getItems({ navigationCollapsed })),
    [navigationCollapsed],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const currentDestination = navigationDestinations.find(
    (destination) => pathname === destination.href || pathname.startsWith(`${destination.href}/`),
  );

  function selectPaletteItem(selected: { id: string }) {
    const item = paletteItems.find((candidate) => candidate.id === selected.id);
    if (!item) return;
    setPaletteOpen(false);
    if (item.href) router.push(item.href);
    if (item.command === 'toggle-navigation') setNavigationCollapsed((collapsed) => !collapsed);
  }

  return (
    <div className="app-shell" data-navigation-collapsed={navigationCollapsed}>
      <nav aria-label="Primary navigation" className="app-nav">
        <Link aria-label="AI Operations overview" className="app-nav__brand" href="/overview">
          <span aria-hidden="true" className="app-nav__brand-mark">
            AI
          </span>
          <span className="app-nav__brand-label">AI Operations</span>
        </Link>
        <button
          aria-controls="app-navigation-groups"
          aria-expanded={!navigationCollapsed}
          aria-label={navigationCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="app-nav__collapse"
          onClick={() => setNavigationCollapsed((collapsed) => !collapsed)}
          type="button"
        >
          <span aria-hidden="true">{navigationCollapsed ? '›' : '‹'}</span>
          <span className="app-nav__collapse-label">
            {navigationCollapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
        <div className="app-nav__groups" id="app-navigation-groups">
          {navigationGroups.map((group) => (
            <section aria-label={group.label} className="app-nav__group" key={group.id}>
              <h2 className="app-nav__group-label">{group.label}</h2>
              <ul>
                {group.destinations.map((destination) => {
                  const active =
                    pathname === destination.href || pathname.startsWith(`${destination.href}/`);
                  return (
                    <li key={destination.id}>
                      <Link
                        aria-current={active ? 'page' : undefined}
                        aria-label={destination.label}
                        className="app-nav__link"
                        data-active={active || undefined}
                        href={destination.href}
                        title={navigationCollapsed ? destination.label : undefined}
                      >
                        <span aria-hidden="true" className="app-nav__short-label">
                          {destination.shortLabel}
                        </span>
                        <span className="app-nav__link-label">{destination.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </nav>

      <header className="app-header">
        <div aria-label="Current location" className="app-header__location">
          <span>AI Operations</span>
          <span aria-hidden="true">/</span>
          <strong>{currentDestination?.label ?? 'Workspace'}</strong>
        </div>
        <div className="app-header__actions">
          <button
            aria-keyshortcuts="Control+K Meta+K"
            className="app-command-trigger"
            onClick={() => setPaletteOpen(true)}
            type="button"
          >
            <span>Jump to…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <ThemeToggle />
          <SessionActivity />
        </div>
      </header>

      <main className="app-main" id="app-main">
        <div className="app-main__canvas">{children}</div>
      </main>

      <Dialog
        className="app-command-dialog"
        description="Search destinations and commands. Use the arrow keys to move and Enter to open."
        onOpenChange={setPaletteOpen}
        open={paletteOpen}
        title="Jump to"
      >
        <Command
          autoFocus
          emptyMessage="No destinations or commands match this search."
          items={paletteItems}
          label="Search destinations and commands"
          onDismiss={() => setPaletteOpen(false)}
          onSelect={selectPaletteItem}
        />
        <p className="app-command-dialog__hint">
          <kbd>↑</kbd> <kbd>↓</kbd> to move <span aria-hidden="true">·</span> <kbd>Enter</kbd> to
          open <span aria-hidden="true">·</span> <kbd>Esc</kbd> to close
        </p>
      </Dialog>
    </div>
  );
}
