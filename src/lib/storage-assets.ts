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
  const endpointValue = env.NEON_STORAGE_ENDPOINT?.trim() || env.AWS_ENDPOINT_URL_S3?.trim();
  const bucket = env.NEON_STORAGE_BUCKET?.trim();
  // AWS_* is reserved/injected by some hosts. Dedicated names win, while old local env files still work.
  const accessKeyId = env.NEON_STORAGE_ACCESS_KEY_ID?.trim() || env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.NEON_STORAGE_SECRET_ACCESS_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!endpointValue && !bucket) return null;
  const required = { NEON_STORAGE_ENDPOINT: endpointValue, NEON_STORAGE_ACCESS_KEY_ID: accessKeyId, NEON_STORAGE_SECRET_ACCESS_KEY: secretAccessKey, NEON_STORAGE_BUCKET: bucket };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing storage configuration: ${missing.join(', ')}`);
  const endpoint = new URL(endpointValue!);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('NEON_STORAGE_ENDPOINT must be an HTTPS origin.');
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket!)) throw new Error('Invalid storage bucket name.');
  const dedicatedConfig = Boolean(env.NEON_STORAGE_ENDPOINT?.trim() || env.NEON_STORAGE_ACCESS_KEY_ID?.trim() || env.NEON_STORAGE_SECRET_ACCESS_KEY?.trim());
  return {
    endpoint: endpoint.origin,
    // A host's Lambda region is unrelated to the Neon storage region.
    region: env.NEON_STORAGE_REGION?.trim() || (!dedicatedConfig && env.AWS_REGION?.trim()) || 'us-east-2',
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
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
