import { describe, expect, it } from 'vitest';
import { MemoryArchiveStore } from './r2';
describe('archive adapter', () => {
  it('hashes and retains exact synthetic bytes', async () => {
    const store = new MemoryArchiveStore();
    const content = new TextEncoder().encode('synthetic');
    const object = await store.put('test/object', content, 'text/plain', 'internal');
    expect(object.sha256).toHaveLength(64);
    expect(await store.get('test/object')).toEqual(content);
  });
});
