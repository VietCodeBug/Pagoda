import { GAME_ASSET_NAMES, type GameAssetName } from './assets';

/** Only these application-owned files may be served through the storage route. */
export const STORAGE_ASSET_NAMES = GAME_ASSET_NAMES;
export type StorageAssetName = GameAssetName;
export type StoredAsset = { key: string; sha256: string; bytes: number; contentType: string };

export function isStorageAssetName(name: string): name is StorageAssetName {
  return (STORAGE_ASSET_NAMES as readonly string[]).includes(name);
}

export function storageObjectKey(name: StorageAssetName, sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid asset SHA-256.');
  return `vto/v1/${sha256}/${name}`;
}

export function assetContentType(name: StorageAssetName) {
  return name.endsWith('.glb') ? 'model/gltf-binary' : name.endsWith('.mp3') ? 'audio/mpeg' : name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.hdr') ? 'image/vnd.radiance' : 'application/json';
}

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** No storage configuration means local assets; partial configuration is an error. */
export function readStorageConfig(env: Record<string, string | undefined>): StorageConfig | null {
  if (!env.AWS_ENDPOINT_URL_S3 && !env.NEON_STORAGE_BUCKET) return null;
  const required = ['AWS_ENDPOINT_URL_S3', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'NEON_STORAGE_BUCKET'] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing storage configuration: ${missing.join(', ')}`);
  const endpoint = new URL(env.AWS_ENDPOINT_URL_S3!);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('AWS_ENDPOINT_URL_S3 must be an HTTPS origin.');
  }
  const bucket = env.NEON_STORAGE_BUCKET!.trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid storage bucket name.');
  return {
    endpoint: endpoint.origin,
    region: env.AWS_REGION?.trim() || 'us-east-2',
    bucket,
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
  };
}

export type ByteRange = { start: number; end: number; length: number; header: string; contentRange: string };

/** A single bounded range prevents malformed/multi-range requests reaching S3. */
export function parseAssetRange(header: string | null, size: number): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) throw new RangeError('Invalid byte range.');
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new RangeError('Invalid byte range.');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) throw new RangeError('Invalid byte range.');
  return { start, end, length: end - start + 1, header: `bytes=${start}-${end}`, contentRange: `bytes ${start}-${end}/${size}` };
}
