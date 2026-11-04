import 'server-only';
import { drizzle } from 'drizzle-orm/neon-http';
import { desc, eq } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

export type GuestProfile = { id: string; name: string; avatar: number; merit: number };
export type PrayerRecord = { id: string; playerId: string; name: string; text: string; isPublic: boolean; createdAt: Date };
const connectionString = () => process.env.DATABASE_URL || process.env.NEON_KEY;
export const persistenceMode = () => connectionString() ? 'neon' as const : 'local' as const;
function db() { return drizzle(connectionString()!, { schema }); }
const localPrayers: PrayerRecord[] = [];

export async function saveProfile(profile: GuestProfile) {
  if (!connectionString()) return profile;
  const [saved] = await db().insert(schema.players).values(profile).onConflictDoUpdate({ target: schema.players.id, set: { name: profile.name, avatar: profile.avatar, updatedAt: new Date() } }).returning();
  return { id: saved.id, name: saved.name, avatar: saved.avatar, merit: saved.merit };
}
export async function loadProfile(id: string): Promise<GuestProfile | null> {
  if (!connectionString()) return null;
  const [profile] = await db().select().from(schema.players).where(eq(schema.players.id, id)).limit(1);
  return profile ? { id: profile.id, name: profile.name, avatar: profile.avatar, merit: profile.merit } : null;
}
export async function listPrayers(): Promise<PrayerRecord[]> {
  if (!connectionString()) return localPrayers.filter((p) => p.isPublic).slice(-40).reverse();
  return db().select().from(schema.prayers).where(eq(schema.prayers.isPublic, true)).orderBy(desc(schema.prayers.createdAt)).limit(40);
}
export async function createPrayer(profile: GuestProfile, text: string, isPublic: boolean): Promise<PrayerRecord | null> {
  const now = new Date();
  const prayer: PrayerRecord = { id: crypto.randomUUID(), playerId: profile.id, name: profile.name, text, isPublic, createdAt: now };
  if (!connectionString()) {
    if (localPrayers.some((p) => p.playerId === profile.id && now.getTime() - p.createdAt.getTime() < 30_000)) return null;
    localPrayers.push(prayer);
    if (localPrayers.length > 1000) localPrayers.shift();
    return prayer;
  }
  // The per-player lock + second statement snapshot make the 30s cooldown
  // atomic across simultaneous requests on separate serverless instances.
  // neon-http's interactive Drizzle transaction is unsupported; use Neon's
  // non-interactive transaction API for these two parameterized statements.
  const sql = neon(connectionString()!);
  const [, inserted] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${profile.id}, 0))`,
    sql`INSERT INTO vto_prayers (id, player_id, name, text, is_public, created_at)
        SELECT ${prayer.id}::uuid, ${profile.id}::uuid, ${profile.name}, ${text}, ${isPublic}, ${now.toISOString()}::timestamptz
        WHERE NOT EXISTS (SELECT 1 FROM vto_prayers WHERE player_id = ${profile.id}::uuid AND created_at > now() - interval '30 seconds')
        RETURNING id, player_id AS "playerId", name, text, is_public AS "isPublic", created_at AS "createdAt"`,
  ]);
  const created = inserted[0] as unknown as PrayerRecord | undefined;
  return created ? { ...created, createdAt: new Date(created.createdAt) } : null;
}
