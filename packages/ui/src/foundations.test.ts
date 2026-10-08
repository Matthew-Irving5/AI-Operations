import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const components = readFileSync(new URL('./components.css', import.meta.url), 'utf8');

describe('design system foundations', () => {
  it('defines light-first and dark semantic layers for key surfaces and signals', () => {
    expect(tokens).toContain(':root,');
    expect(tokens).toContain(":root[data-theme='dark']");
    for (const token of ['--canvas:', '--surface:', '--text-primary:', '--signal:', '--danger:']) {
      expect(tokens).toContain(token);
    }
  });

  it('keeps component paint semantic and disables motion when reduced motion is requested', () => {
    expect(components).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(components).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ui-spinner\s*\{\s*animation:\s*none;/,
    );
    expect(components).toContain(':focus-visible');
  });
});
