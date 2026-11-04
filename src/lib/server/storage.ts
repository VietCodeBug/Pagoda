import 'server-only';
import { S3Client, HeadObjectCommand, GetObjectCommand, type HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import manifest from './storage-manifest.json';
import { readStorageConfig, type StorageConfig, type StorageAssetName, type StoredAsset } from '../storage-assets';

let cachedClient: { signature: string; client: S3Client } | undefined;
const metadataCache = new Map<string, { expires: number; metadata: HeadObjectCommandOutput }>();

export function getAssetStorageConfig() {
  return readStorageConfig(process.env);
}

function storageClient(config: StorageConfig) {
  // The signature is in-memory only and never returned or logged.
  const signature = JSON.stringify(config);
  if (!cachedClient || cachedClient.signature !== signature) {
    cachedClient?.client.destroy();
    metadataCache.clear();
    cachedClient = {
      signature,
      client: new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    };
  }
  return cachedClient.client;
}

export function getStoredAsset(name: StorageAssetName): StoredAsset {
  const asset = manifest.assets[name];
  if (!asset) throw new Error('Asset not present in the uploaded manifest.');
  return asset;
}

export async function getStoredAssetMetadata(config: StorageConfig, asset: StoredAsset, signal: AbortSignal) {
  const client = storageClient(config);
  const cacheKey = `${config.bucket}:${asset.key}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.metadata;
  const metadata = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: asset.key }), {
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  });
  if (metadata.ContentLength !== asset.bytes || (metadata.Metadata?.sha256 && metadata.Metadata.sha256 !== asset.sha256)) {
    throw new Error('Stored asset integrity metadata does not match this build.');
  }
  metadataCache.set(cacheKey, { metadata, expires: Date.now() + 60_000 });
  return metadata;
}

/** The secret key stays server-side; the URL grants GET access to one asset for an hour. */
export async function signStoredAsset(config: StorageConfig, asset: StoredAsset, range?: string) {
  return getSignedUrl(storageClient(config), new GetObjectCommand({
    Bucket: config.bucket,
    Key: asset.key,
    ...(range ? { Range: range } : {}),
  }), { expiresIn: 3600 });
}
