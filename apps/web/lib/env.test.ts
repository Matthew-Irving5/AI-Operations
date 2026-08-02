import { expect, it } from 'vitest';
import { parsePublicEnvironment } from './env';

it('rejects missing public Supabase configuration', () => {
  expect(() =>
    parsePublicEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.test' }),
  ).toThrow();
});
