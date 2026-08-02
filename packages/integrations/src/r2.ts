import { createHash } from 'node:crypto';
export type ObjectMetadata = Readonly<{
  key: string;
  sha256: string;
  bytes: number;
  mimeType: string;
  classification: 'sensitive' | 'restricted' | 'internal';
}>;
export interface ArchiveStore {
  put(
    key: string,
    content: Uint8Array,
    mimeType: string,
    classification: ObjectMetadata['classification'],
  ): Promise<ObjectMetadata>;
  get(key: string): Promise<Uint8Array | undefined>;
}
export class MemoryArchiveStore implements ArchiveStore {
  #objects = new Map<string, Uint8Array>();
  async put(
    key: string,
    content: Uint8Array,
    mimeType: string,
    classification: ObjectMetadata['classification'],
  ) {
    this.#objects.set(key, content);
    return {
      key,
      mimeType,
      classification,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  }
  async get(key: string) {
    return this.#objects.get(key);
  }
}
