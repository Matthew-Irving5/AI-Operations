import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './middleware';

describe('content security policy', () => {
  it('permits the origins required by the restricted Google Drive Picker', () => {
    const policy = contentSecurityPolicy('test-nonce');

    expect(policy).toContain("'nonce-test-nonce'");
    expect(policy).toContain('https://apis.google.com');
    expect(policy).toContain('https://accounts.google.com');
    expect(policy).toContain('https://www.googleapis.com');
    expect(policy).toContain(
      "frame-src 'self' https://docs.google.com https://accounts.google.com",
    );
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
