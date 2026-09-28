import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertLocalTestAuthEnvironment,
  assertNoLocalTestAuthInBuild,
  validateStagingAuthCredentials,
} from './local-test-auth';

const localEnvironment = {
  LOCAL_TEST_AUTH: 'true',
  LOCAL_TEST_APP_ORIGIN: 'http://127.0.0.1:43123',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55123',
  APP_ENV: 'local',
  NODE_ENV: 'development',
  E2E_JWT_SECRET: randomUUID(),
  LOCAL_TEST_EMAIL: 'matthewirving99@gmail.com',
  LOCAL_TEST_PASSWORD: randomUUID(),
};

describe('local test authentication environment', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(assertLocalTestAuthEnvironment({})).toBe(false);
    expect(() => assertLocalTestAuthEnvironment({ LOCAL_TEST_AUTH: '' })).toThrow(
      /must be explicitly set/,
    );
  });

  it('allows only the explicitly configured loopback development runtime', () => {
    expect(assertLocalTestAuthEnvironment(localEnvironment)).toBe(true);
    expect(() =>
      assertLocalTestAuthEnvironment({ ...localEnvironment, NODE_ENV: 'production' }),
    ).toThrow(/restricted to a development app/);
    expect(() =>
      assertLocalTestAuthEnvironment({ ...localEnvironment, APP_ENV: 'staging' }),
    ).toThrow(/restricted to a development app/);
    expect(() =>
      assertLocalTestAuthEnvironment({
        ...localEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: 'https://jqtssfrfocnibffdkqch.supabase.co',
      }),
    ).toThrow(/restricted to a development app/);
    expect(() =>
      assertLocalTestAuthEnvironment({ ...localEnvironment, LOCAL_TEST_AUTH: 'false' }),
    ).toThrow(/must be explicitly set/);
  });

  it('requires local credentials and a local signing secret', () => {
    expect(() =>
      assertLocalTestAuthEnvironment({ ...localEnvironment, E2E_JWT_SECRET: undefined }),
    ).toThrow(/requires local credentials/);
    expect(() =>
      assertLocalTestAuthEnvironment({ ...localEnvironment, LOCAL_TEST_PASSWORD: undefined }),
    ).toThrow(/requires local credentials/);
  });

  it('requires explicit Auth-only staging validation configuration', () => {
    expect(() =>
      assertLocalTestAuthEnvironment({
        ...localEnvironment,
        LOCAL_TEST_AUTH_VALIDATE_STAGING: 'true',
      }),
    ).toThrow(/staging anon key/);
  });
});

describe('hosted build auth boundary', () => {
  it('rejects the local test flag by presence, including an empty value', () => {
    expect(() => assertNoLocalTestAuthInBuild({})).not.toThrow();
    expect(() => assertNoLocalTestAuthInBuild({ LOCAL_TEST_AUTH: '' })).toThrow(
      /forbidden in production builds/,
    );
    expect(() => assertNoLocalTestAuthInBuild({ LOCAL_TEST_AUTH: 'true' })).toThrow(
      /forbidden in production builds/,
    );
  });
});

describe('staging Auth credential validation', () => {
  it('posts only to the fixed staging Auth password endpoint and returns no remote session', async () => {
    const email = `qa-${randomUUID()}@example.test`;
    const password = randomUUID();
    const anonKey = randomUUID();
    const response = Response.json({ access_token: randomUUID() }, { status: 200 });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), ...(init ? { init } : {}) });
      return response;
    };
    await expect(validateStagingAuthCredentials(email, password, anonKey, fetcher)).resolves.toBe(
      true,
    );
    const [call] = calls;
    expect(call?.url).toBe(
      'https://jqtssfrfocnibffdkqch.supabase.co/auth/v1/token?grant_type=password',
    );
    expect(call?.init?.method).toBe('POST');
    expect(call?.init?.redirect).toBe('error');
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      email,
      password,
    });
  });

  it('fails closed for invalid credentials and provider/network errors', async () => {
    const email = `qa-${randomUUID()}@example.test`;
    await expect(
      validateStagingAuthCredentials(email, randomUUID(), randomUUID(), async () =>
        Response.json({}, { status: 400 }),
      ),
    ).resolves.toBe(false);
    await expect(
      validateStagingAuthCredentials(email, randomUUID(), randomUUID(), async () => {
        throw new Error('network failure');
      }),
    ).resolves.toBe(false);
  });
});
