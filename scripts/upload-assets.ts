/** Upload only allowlisted application assets; preserve all other bucket objects. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import {
  S3Client, ListBucketsCommand, CreateBucketCommand, HeadBucketCommand,
  HeadObjectCommand, PutObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { STORAGE_ASSET_NAMES, assetContentType, readStorageConfig, storageObjectKey, type StoredAsset } from '../src/lib/storage-assets';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
const root = process.cwd();
// Bucket discovery below still works when one has not been chosen; all credentials use runtime's resolver.
const storage = readStorageConfig({ ...process.env, NEON_STORAGE_BUCKET: process.env.NEON_STORAGE_BUCKET?.trim() || 'virtual-temple-assets' })!;
const client = new S3Client({
  endpoint: storage.endpoint,
  region: storage.region,
  credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

function sha256(data: Uint8Array) { return createHash('sha256').update(data).digest('hex'); }
function isMissing(error: unknown) {
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.$metadata?.httpStatusCode === 404 || value.name === 'NotFound' || value.name === 'NoSuchKey';
}

async function run() {
  let bucket = process.env.NEON_STORAGE_BUCKET?.trim();
  if (!bucket) {
    const listed = await client.send(new ListBucketsCommand({}));
    const available = listed.Buckets?.flatMap((item) => item.Name ? [item.Name] : []) || [];
    bucket = available.includes('virtual-temple-assets') ? 'virtual-temple-assets' : available.includes('pagoda') ? 'pagoda' : 'virtual-temple-assets';
    if (!available.includes(bucket)) await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  const assets: Record<string, StoredAsset> = {};
  let uploaded = 0;
  for (const name of STORAGE_ASSET_NAMES) {
    const bytes = await readFile(path.join(root, 'public', 'assets', name));
    const hash = sha256(bytes);
    const entry = { key: storageObjectKey(name, hash), sha256: hash, bytes: bytes.length, contentType: assetContentType(name) };
    assets[name] = entry;
    let exists = false;
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: entry.key }));
      exists = true;
    } catch (error) { if (!isMissing(error)) throw error; }
    if (!exists) {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: entry.key, Body: bytes, ContentLength: bytes.length,
        ContentType: entry.contentType, CacheControl: 'public, max-age=31536000, immutable',
        Metadata: { sha256: hash, 'asset-version': '1' }, IfNoneMatch: '*',
      }));
      uploaded++;
    }
    const metadata = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: entry.key }));
    if (metadata.ContentLength !== bytes.length) throw new Error(`Storage size mismatch for ${name}.`);
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: entry.key }));
    const downloaded = await object.Body?.transformToByteArray();
    if (!downloaded || sha256(downloaded) !== hash) throw new Error(`Storage checksum mismatch for ${name}.`);
    console.log(`${exists ? 'Verified existing' : 'Uploaded and verified'} ${name} (${bytes.length} bytes)`);
  }
  await mkdir(path.join(root, 'src', 'lib', 'server'), { recursive: true });
  await writeFile(path.join(root, 'src', 'lib', 'server', 'storage-manifest.json'), JSON.stringify({ version: 1, assets }, null, 2) + '\n');
  const envPath = path.join(root, '.env.local');
  let localEnv = '';
  try { localEnv = await readFile(envPath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (!/^NEON_STORAGE_BUCKET=/m.test(localEnv)) await writeFile(envPath, localEnv.replace(/\s*$/, '\n') + `NEON_STORAGE_BUCKET=${bucket}\n`);
  console.log(JSON.stringify({ bucket, prefix: 'vto/v1/', assets: STORAGE_ASSET_NAMES.length, uploaded, verifiedBytes: Object.values(assets).reduce((sum, entry) => sum + entry.bytes, 0) }));
}

run().catch((error: unknown) => {
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  // SDK errors may contain request metadata; never print credential-bearing request objects.
  console.error(JSON.stringify({ error: value.name || 'StorageUploadFailed', status: value.$metadata?.httpStatusCode || null }));
  process.exitCode = 1;
}).finally(() => client.destroy());
