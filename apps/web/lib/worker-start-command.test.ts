import { describe, expect, it } from 'vitest';
import { workerStartCommand } from './worker-start-command';

describe('worker start command', () => {
  it('uses the staging task outside production', () => {
    expect(workerStartCommand('staging')).toContain('AI Operations Staging Worker');
  });

  it('uses the production task in production', () => {
    expect(workerStartCommand('production')).toContain('AI Operations Windows Worker');
  });

  it('never embeds worker credentials', () => {
    expect(workerStartCommand('staging')).not.toMatch(/secret|token|key/i);
  });
});
