export type Theme = 'light' | 'dark';

export const themeStorageKey = 'ai-operations-theme';

export function readThemePreference(storage?: Pick<Storage, 'getItem'>): Theme {
  try {
    return (storage ?? window.localStorage).getItem(themeStorageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyThemePreference(
  theme: Theme,
  root: Pick<HTMLElement, 'setAttribute'>,
  storage?: Pick<Storage, 'setItem'>,
): void {
  root.setAttribute('data-theme', theme);
  try {
    (storage ?? window.localStorage).setItem(themeStorageKey, theme);
  } catch {
    // The active theme still applies when browser storage is unavailable.
  }
}

export const themeBootstrapScript = `(() => {
  try {
    const theme = localStorage.getItem('${themeStorageKey}');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch {
    // The light theme remains the safe first-paint default.
  }
})();`;
