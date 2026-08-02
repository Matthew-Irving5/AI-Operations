import { describe, expect, it } from 'vitest';
import { LoadingState } from './states';
describe('shared UI states', () => {
  it('exports the loading component', () => {
    expect(LoadingState).toBeTypeOf('function');
  });
});
