import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from './supabase-server';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

describe('Supabase SSR session cookies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'a'.repeat(30));
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [],
      set: vi.fn(),
    } as never);
    vi.mocked(createServerClient).mockReturnValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('sets HttpOnly, SameSite, and Secure cookies in deployed environments', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await createSupabaseServerClient();

    expect(createServerClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'a'.repeat(30),
      expect.objectContaining({
        cookieOptions: expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          secure: true,
          path: '/',
        }),
      }),
    );
  });

  it('keeps localhost sessions usable over HTTP while retaining HttpOnly and SameSite', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await createSupabaseServerClient();

    expect(createServerClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'a'.repeat(30),
      expect.objectContaining({
        cookieOptions: expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          path: '/',
        }),
      }),
    );
  });
});
