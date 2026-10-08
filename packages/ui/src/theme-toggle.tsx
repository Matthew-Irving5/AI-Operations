'use client';

import { useEffect, useState } from 'react';
import { applyThemePreference, readThemePreference, type Theme } from './theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(readThemePreference());
  }, []);

  const nextTheme = theme === 'light' ? 'dark' : 'light';

  return (
    <button
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === 'dark'}
      className="ui-theme-toggle"
      onClick={() => {
        applyThemePreference(nextTheme, document.documentElement);
        setTheme(nextTheme);
      }}
      data-ui="theme-toggle"
      type="button"
    >
      <span aria-hidden="true" className="ui-theme-toggle__indicator" />
      {theme === 'dark' ? 'Dark appearance' : 'Light appearance'}
    </button>
  );
}
