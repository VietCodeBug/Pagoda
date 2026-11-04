import { type NextRequest } from 'next/server';
import { isStorageAssetName, parseAssetRange } from '@/lib/storage-assets';
import { getAssetStorageConfig, getStoredAsset, getStoredAssetMetadata, signStoredAsset } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ name: string }> };
const aliasCache = 'public, max-age=0, s-maxage=60';

async function serve(request: NextRequest, context: Context, headOnly: boolean) {
  const { name } = await context.params;
  if (!isStorageAssetName(name)) return Response.json({ error: 'Không tìm thấy asset.' }, { status: 404 });
  try {
    const config = getAssetStorageConfig();
    if (!config) {
      return new Response(null, {
        status: 307,
        headers: { Location: `/assets/${name}`, 'Cache-Control': 'no-store', 'X-Asset-Storage': 'local' },
      });
    }
    const asset = getStoredAsset(name);
    const range = parseAssetRange(request.headers.get('range'), asset.bytes);
    const metadata = await getStoredAssetMetadata(config, asset, request.signal);
    const headers = new Headers({
      'Cache-Control': aliasCache,
      'X-Asset-Storage': 'neon-s3',
      'X-Asset-SHA256': asset.sha256,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Range',
    });
    if (headOnly) {
      headers.set('Content-Type', asset.contentType);
      headers.set('Content-Length', String(range?.length || asset.bytes));
      if (metadata.ETag) headers.set('ETag', metadata.ETag);
      if (range) headers.set('Content-Range', range.contentRange);
      return new Response(null, { status: range ? 206 : 200, headers });
    }
    // A redirect avoids proxying model/audio bytes through a Vercel Function.
    // The hashed object is immutable; this stable alias has only a short edge cache.
    // Keep the original form (e.g. bytes=0-) because a signed Range header must
    // match the header the browser forwards across the redirect.
    headers.set('Location', await signStoredAsset(config, asset, range ? request.headers.get('range')!.trim() : undefined));
    return new Response(null, { status: 307, headers });
  } catch (error) {
    if (error instanceof RangeError) {
      const asset = getStoredAsset(name);
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${asset.bytes}`, 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: 'Không tải được asset từ kho lưu trữ.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export function GET(request: NextRequest, context: Context) { return serve(request, context, false); }
export function HEAD(request: NextRequest, context: Context) { return serve(request, context, true); }
