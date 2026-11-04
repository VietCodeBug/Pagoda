import { describe, expect, it } from 'vitest';
import { isStorageAssetName, parseAssetRange, readStorageConfig, storageObjectKey } from './storage-assets';

describe('storage asset boundary', () => {
  it('only allows application assets, never arbitrary bucket files', () => {
    expect(isStorageAssetName('avatar.glb')).toBe(true);
    expect(isStorageAssetName('temple-ambient.mp3')).toBe(true);
    expect(isStorageAssetName('golden-sky.hdr')).toBe(true);
    expect(isStorageAssetName('garden-fern.glb')).toBe(true);
    for (const name of ['.env', '../avatar.glb', 'private/prayer.txt', 'avatar.glb?key=other', 'AVATAR.glb']) expect(isStorageAssetName(name)).toBe(false);
  });
  it('separates absent storage from broken configuration', () => {
    expect(readStorageConfig({})).toBeNull();
    expect(readStorageConfig({ AWS_REGION: 'us-west-2', AWS_ACCESS_KEY_ID: 'host-role', AWS_SECRET_ACCESS_KEY: 'host-secret' })).toBeNull();
    expect(() => readStorageConfig({ AWS_ENDPOINT_URL_S3: 'https://example.invalid' })).toThrow('Missing storage configuration');
    expect(() => readStorageConfig({ NEON_STORAGE_ENDPOINT: 'https://example.invalid' })).toThrow('NEON_STORAGE_ACCESS_KEY_ID');
    expect(() => readStorageConfig({ AWS_ENDPOINT_URL_S3: 'http://example.invalid', AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', NEON_STORAGE_BUCKET: 'pagoda' })).toThrow('HTTPS origin');
  });
  it('prefers dedicated storage variables over host AWS credentials', () => {
    expect(readStorageConfig({
      NEON_STORAGE_ENDPOINT: ' https://storage.example.invalid/ ', NEON_STORAGE_ACCESS_KEY_ID: 'neon-key', NEON_STORAGE_SECRET_ACCESS_KEY: 'neon-secret', NEON_STORAGE_REGION: 'us-east-2', NEON_STORAGE_BUCKET: 'pagoda',
      AWS_ENDPOINT_URL_S3: 'https://other.example.invalid', AWS_ACCESS_KEY_ID: 'host-role', AWS_SECRET_ACCESS_KEY: 'host-secret', AWS_REGION: 'us-west-2',
    })).toEqual({ endpoint: 'https://storage.example.invalid', accessKeyId: 'neon-key', secretAccessKey: 'neon-secret', region: 'us-east-2', bucket: 'pagoda' });
  });
  it('does not use a provider-injected Lambda region for dedicated Neon storage', () => {
    const dedicated = { NEON_STORAGE_ENDPOINT: 'https://storage.example.invalid', NEON_STORAGE_ACCESS_KEY_ID: 'neon-key', NEON_STORAGE_SECRET_ACCESS_KEY: 'neon-secret', NEON_STORAGE_BUCKET: 'pagoda', AWS_REGION: 'us-west-2' };
    expect(readStorageConfig(dedicated)?.region).toBe('us-east-2');
    expect(readStorageConfig({ ...dedicated, NEON_STORAGE_REGION: 'eu-central-1' })?.region).toBe('eu-central-1');
  });
  it('keeps legacy AWS storage variables usable for existing local installs', () => {
    expect(readStorageConfig({ AWS_ENDPOINT_URL_S3: 'https://legacy.example.invalid', AWS_ACCESS_KEY_ID: 'legacy-key', AWS_SECRET_ACCESS_KEY: 'legacy-secret', AWS_REGION: 'eu-central-1', NEON_STORAGE_BUCKET: 'pagoda' }))
      .toEqual({ endpoint: 'https://legacy.example.invalid', accessKeyId: 'legacy-key', secretAccessKey: 'legacy-secret', region: 'eu-central-1', bucket: 'pagoda' });
  });
  it('uses a content address rather than overwriting a mutable filename', () => {
    const first = storageObjectKey('avatar.glb', 'a'.repeat(64));
    const second = storageObjectKey('avatar.glb', 'b'.repeat(64));
    expect(first).not.toBe(second);
    expect(first).toMatch(/^vto\/v1\/[a-f0-9]{64}\/avatar\.glb$/);
  });
});

describe('asset byte ranges', () => {
  it('normalizes bounded, open-ended and suffix requests', () => {
    expect(parseAssetRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9, length: 10, header: 'bytes=0-9', contentRange: 'bytes 0-9/100' });
    expect(parseAssetRange('bytes=90-', 100)?.length).toBe(10);
    expect(parseAssetRange('bytes=-10', 100)?.start).toBe(90);
    expect(parseAssetRange('bytes=0-1000', 100)?.end).toBe(99);
  });
  it('rejects invalid, unsatisfiable and multi-range reads', () => {
    for (const value of ['bytes=100-', 'bytes=2-1', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-6', 'items=0-2', 'bytes=999999999999999999999-']) expect(() => parseAssetRange(value, 100)).toThrow(RangeError);
    expect(parseAssetRange(null, 100)).toBeNull();
  });
});
