import 'server-only';
import { publicPrayerRows, type PublicPrayer } from '../prayer-stream';

/** Optional server-to-server PostgREST read. No Auth provider is installed by this adapter. */
export async function listPublicPrayersViaDataApi(): Promise<PublicPrayer[] | null> {
  const endpoint = process.env.NEON_DATA_API_URL?.trim();
  const token = process.env.NEON_DATA_API_TOKEN?.trim();
  // Neon requires a valid provider JWT even for the anonymous role. Keep using
  // the established SQL path until such a token is explicitly configured.
  if (!endpoint || !token) return null;
  const base = new URL(endpoint.replace(/\/$/, '') + '/');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Invalid Data API URL');
  const url = new URL('vto_public_prayers', base);
  url.searchParams.set('select', 'id,name,text,createdAt');
  url.searchParams.set('order', 'createdAt.desc,id.desc');
  url.searchParams.set('limit', '40');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Public Data API read failed');
  return publicPrayerRows(await response.json());
}
