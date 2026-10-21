import { describe, expect, it } from 'vitest';
import { commandProviders, navigationDestinations, navigationGroups } from './navigation';

const existingRoutes = [
  '/overview',
  '/personal',
  '/health',
  '/finance',
  '/career',
  '/travel',
  '/procurement',
  '/digital-estate',
  '/systems-automation',
  '/operations',
  '/reports',
  '/approvals',
  '/spend-forecasting',
  '/ai-traces-audit',
  '/feedback-quality',
  '/data-sources',
  '/automations',
  '/devices',
  '/settings',
];

describe('application shell navigation', () => {
  it('groups all 19 established destinations without changing their paths', () => {
    expect(navigationGroups.map((group) => group.label)).toEqual([
      'Everyday',
      'Managers',
      'Attention & work',
      'System',
    ]);
    expect(navigationDestinations.map((destination) => destination.href).sort()).toEqual(
      [...existingRoutes].sort(),
    );
    expect(new Set(navigationDestinations.map((destination) => destination.href)).size).toBe(19);
  });

  it('provides every current route and a common navigation command to the palette', () => {
    const items = commandProviders.flatMap((provider) =>
      provider.getItems({ navigationCollapsed: false }),
    );

    expect(
      items
        .filter((item) => item.href)
        .map((item) => item.href)
        .sort(),
    ).toEqual([...existingRoutes].sort());
    expect(items.some((item) => item.command === 'toggle-navigation')).toBe(true);
    expect(items.every((item) => item.group.length > 0)).toBe(true);
  });
});
