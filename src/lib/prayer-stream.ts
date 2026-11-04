/** Public data contract shared by the live-query endpoint and the journal UI. */
export type PublicPrayer = { id: string; name: string; text: string; createdAt: string };
export type PrayerStreamStatus = 'connecting' | 'live' | 'reconnecting' | 'unavailable';

// This SQL is fixed on the server. A browser never supplies SQL or a player ID.
// The beta live-query service does not support RLS, so the public predicate is essential.
export const PUBLIC_PRAYERS_SQL = 'SELECT id, name, text, created_at AS "createdAt" FROM public.vto_prayers WHERE is_public = true ORDER BY created_at DESC, id DESC LIMIT 40';

/** Strip internal fields and reject malformed/private rows before rendering. */
export function publicPrayerRows(value: unknown): PublicPrayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((input): PublicPrayer[] => {
    if (!input || typeof input !== 'object') return [];
    const row = input as Record<string, unknown>;
    if (row.isPublic === false || row.is_public === false) return [];
    const { id, name, text } = row;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return [];
    if (typeof name !== 'string' || !name.length || name.length > 24 || typeof text !== 'string' || !text.length || text.length > 500) return [];
    const date = row.createdAt instanceof Date ? row.createdAt : typeof row.createdAt === 'string' ? new Date(row.createdAt) : null;
    if (!date || !Number.isFinite(date.getTime())) return [];
    return [{ id, name, text, createdAt: date.toISOString() }];
  }).slice(0, 40);
}
