import { describe, expect, it } from 'vitest';
import {
  applyThemePreference,
  readThemePreference,
  themeBootstrapScript,
  themeStorageKey,
} from './theme';

describe('theme preference', () => {
  it('uses light as the first-paint and invalid-value fallback', () => {
    expect(readThemePreference({ getItem: () => null })).toBe('light');
    expect(readThemePreference({ getItem: () => 'system' })).toBe('light');
  });

  it('applies and persists the selected theme', () => {
    let appliedTheme = '';
    let storedPreference = '';
    const root = { setAttribute: (_name: string, value: string) => (appliedTheme = value) };
    const storage = {
      setItem: (key: string, value: string) => {
        expect(key).toBe(themeStorageKey);
        storedPreference = value;
      },
    };

    applyThemePreference('dark', root, storage);

    expect(appliedTheme).toBe('dark');
    expect(storedPreference).toBe('dark');
  });

  it('keeps the selected theme when browser storage is unavailable', () => {
    let appliedTheme = '';
    const root = { setAttribute: (_name: string, value: string) => (appliedTheme = value) };
    const blockedStorage = {
      setItem: () => {
        throw new Error('storage is disabled');
      },
    };

    expect(() => applyThemePreference('dark', root, blockedStorage)).not.toThrow();
    expect(appliedTheme).toBe('dark');
  });

  it('restores the saved theme before paint without accepting arbitrary stored values', () => {
    expect(themeBootstrapScript).toContain("localStorage.getItem('ai-operations-theme')");
    expect(themeBootstrapScript).toContain("theme === 'light' || theme === 'dark'");
    expect(themeBootstrapScript).toContain("setAttribute('data-theme', theme)");
  });
});
