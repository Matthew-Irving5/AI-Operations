export type NavigationGroupId = 'everyday' | 'managers' | 'attention' | 'system';

export type NavigationDestination = {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  group: NavigationGroupId;
  keywords: string;
};

export type CommandPaletteItem = {
  id: string;
  label: string;
  description: string;
  group: string;
  keywords?: string;
  href?: string;
  command?: 'toggle-navigation';
};

export type CommandProviderContext = { navigationCollapsed: boolean };

export type CommandProvider = {
  id: string;
  getItems: (context: CommandProviderContext) => readonly CommandPaletteItem[];
};

export const navigationGroups: ReadonlyArray<{
  id: NavigationGroupId;
  label: string;
  destinations: readonly NavigationDestination[];
}> = [
  {
    id: 'everyday',
    label: 'Everyday',
    destinations: [
      {
        id: 'overview',
        label: 'Overview',
        shortLabel: 'OV',
        href: '/overview',
        group: 'everyday',
        keywords: 'home dashboard today',
      },
      {
        id: 'personal',
        label: 'Personal',
        shortLabel: 'ME',
        href: '/personal',
        group: 'everyday',
        keywords: 'planner executive assistant calendar tasks',
      },
    ],
  },
  {
    id: 'managers',
    label: 'Managers',
    destinations: [
      {
        id: 'health',
        label: 'Health',
        shortLabel: 'HE',
        href: '/health',
        group: 'managers',
        keywords: 'health performance fitness',
      },
      {
        id: 'finance',
        label: 'Finance',
        shortLabel: 'FI',
        href: '/finance',
        group: 'managers',
        keywords: 'finance money budget',
      },
      {
        id: 'career',
        label: 'Career',
        shortLabel: 'CA',
        href: '/career',
        group: 'managers',
        keywords: 'career work jobs',
      },
      {
        id: 'travel',
        label: 'Travel',
        shortLabel: 'TR',
        href: '/travel',
        group: 'managers',
        keywords: 'travel trips',
      },
      {
        id: 'procurement',
        label: 'Procurement',
        shortLabel: 'PR',
        href: '/procurement',
        group: 'managers',
        keywords: 'procurement purchasing products',
      },
      {
        id: 'digital-estate',
        label: 'Digital Estate',
        shortLabel: 'DE',
        href: '/digital-estate',
        group: 'managers',
        keywords: 'digital estate device security',
      },
      {
        id: 'systems-automation',
        label: 'Systems & Automation',
        shortLabel: 'SY',
        href: '/systems-automation',
        group: 'managers',
        keywords: 'systems automation platform',
      },
    ],
  },
  {
    id: 'attention',
    label: 'Attention & work',
    destinations: [
      {
        id: 'operations',
        label: 'Operations',
        shortLabel: 'OP',
        href: '/operations',
        group: 'attention',
        keywords: 'runs queues jobs attention',
      },
      {
        id: 'approvals',
        label: 'Approvals',
        shortLabel: 'AP',
        href: '/approvals',
        group: 'attention',
        keywords: 'actions review approve',
      },
      {
        id: 'reports',
        label: 'Reports',
        shortLabel: 'RE',
        href: '/reports',
        group: 'attention',
        keywords: 'reports evidence',
      },
      {
        id: 'spend-forecasting',
        label: 'Spend & Forecasting',
        shortLabel: 'SP',
        href: '/spend-forecasting',
        group: 'attention',
        keywords: 'spend cost forecasting budget',
      },
      {
        id: 'ai-traces-audit',
        label: 'AI Traces & Audit',
        shortLabel: 'AU',
        href: '/ai-traces-audit',
        group: 'attention',
        keywords: 'traces audit observability',
      },
      {
        id: 'feedback-quality',
        label: 'Feedback & Quality',
        shortLabel: 'QA',
        href: '/feedback-quality',
        group: 'attention',
        keywords: 'feedback evaluations quality',
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    destinations: [
      {
        id: 'data-sources',
        label: 'Data Sources',
        shortLabel: 'DS',
        href: '/data-sources',
        group: 'system',
        keywords: 'connections integrations google apple',
      },
      {
        id: 'automations',
        label: 'Automations',
        shortLabel: 'AT',
        href: '/automations',
        group: 'system',
        keywords: 'schedules automation',
      },
      {
        id: 'devices',
        label: 'Devices',
        shortLabel: 'DV',
        href: '/devices',
        group: 'system',
        keywords: 'devices worker pairing',
      },
      {
        id: 'settings',
        label: 'Settings',
        shortLabel: 'ST',
        href: '/settings',
        group: 'system',
        keywords: 'settings configuration onboarding',
      },
    ],
  },
];

export const navigationDestinations = navigationGroups.flatMap((group) => group.destinations);

export const commandProviders: readonly CommandProvider[] = [
  {
    id: 'destinations',
    getItems: () =>
      navigationDestinations.map((destination) => ({
        id: `destination-${destination.id}`,
        label: destination.label,
        description: destination.href,
        group: 'Destinations',
        keywords: `${destination.keywords} ${destination.group}`,
        href: destination.href,
      })),
  },
  {
    id: 'common-commands',
    getItems: ({ navigationCollapsed }) => [
      {
        id: 'toggle-navigation',
        label: navigationCollapsed ? 'Expand navigation' : 'Compact navigation',
        description: 'Change the navigation rail width',
        group: 'Commands',
        keywords: 'rail sidebar collapse expand width',
        command: 'toggle-navigation',
      },
    ],
  },
];
