import { expect, it } from 'vitest';
import { GET } from './route';

it('keeps the safe GET endpoint as a redirect to the login shell', () => {
  const response = GET(new Request('https://operations.example/api/auth/sign-in'));

  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('https://operations.example/login');
});
