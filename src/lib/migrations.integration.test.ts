import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { applyMigrations, MIGRATION_FILES } from './migrations';

const playerId = '00000000-0000-4000-8000-000000000001';
const privateId = '00000000-0000-4000-8000-000000000002';
const source = (file: string) => readFile(`drizzle/${file}`, 'utf8');
const legacySource = () => readFile(new URL('./fixtures/pr1-generated-baseline.sql', import.meta.url), 'utf8');

async function withDatabase(run: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anonymous; CREATE ROLE authenticated;');
    await run(db);
  } finally { await db.close(); }
}

async function migrate(db: PGlite) {
  const available: string[] = [...MIGRATION_FILES].reverse();
  available.push('0000_little_mathemanic.sql');
  const plan = await applyMigrations(available, async (file) => {
    // The duplicate must never be loaded/executed, including on a fresh DB.
    expect(file).not.toBe('0000_little_mathemanic.sql');
    return source(file);
  }, async (statements) => {
    await db.transaction(async (tx) => {
      for (const statement of statements) await tx.exec(statement);
    });
  });
  expect(plan.ignored).toEqual(['0000_little_mathemanic.sql']);
}

async function seed(db: PGlite) {
  await db.query('INSERT INTO vto_players(id,name,avatar) VALUES ($1,$2,$3)', [playerId, 'Kept player', 2]);
  await db.query('INSERT INTO vto_prayers(id,player_id,name,text,is_public) VALUES ($1,$2,$3,$4,$5),($6,$2,$3,$7,$8)', [playerId, playerId, 'Kept player', 'Public prayer', true, privateId, 'Private prayer', false]);
}

async function verifyDataAndPrivacy(db: PGlite) {
  const constraints = await db.query<{ conname: string; convalidated: boolean }>("SELECT conname,convalidated FROM pg_constraint WHERE conname IN ('vto_players_avatar_range','vto_prayer_length') ORDER BY conname");
  expect(constraints.rows).toEqual([
    { conname: 'vto_players_avatar_range', convalidated: true },
    { conname: 'vto_prayer_length', convalidated: true },
  ]);
  expect((await db.query("SELECT conname FROM pg_constraint WHERE conrelid='public.vto_prayers'::regclass AND contype='f'")).rows).toEqual([{ conname: 'vto_prayers_player_id_fkey' }]);
  await expect(db.query('UPDATE vto_players SET avatar=4 WHERE id=$1', [playerId])).rejects.toMatchObject({ code: '23514' });
  await expect(db.query("UPDATE vto_prayers SET text='' WHERE id=$1", [playerId])).rejects.toMatchObject({ code: '23514' });
  await expect(db.query('UPDATE vto_prayers SET text=$1 WHERE id=$2', ['x'.repeat(501), playerId])).rejects.toMatchObject({ code: '23514' });
  expect((await db.query('SELECT avatar FROM vto_players WHERE id=$1', [playerId])).rows).toEqual([{ avatar: 2 }]);
  expect((await db.query('SELECT text FROM vto_prayers ORDER BY id')).rows).toEqual([{ text: 'Public prayer' }, { text: 'Private prayer' }]);
  await db.exec('SET ROLE anonymous');
  try {
    expect((await db.query('SELECT text FROM public.vto_public_prayers')).rows).toEqual([{ text: 'Public prayer' }]);
    await expect(db.query('SELECT * FROM public.vto_prayers')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('SELECT * FROM public.vto_players')).rejects.toMatchObject({ code: '42501' });
  } finally { await db.exec('RESET ROLE'); }
}

describe('migrations on real in-memory PostgreSQL', () => {
  it('initializes a fresh database and reruns without losing rows or public/private protection', async () => {
    await withDatabase(async (db) => {
      await migrate(db);
      await seed(db);
      await verifyDataAndPrivacy(db);
      await migrate(db);
      await verifyDataAndPrivacy(db);
    });
  }, 30_000);

  it('upgrades the original database while retaining player/prayer data across repeated runs', async () => {
    await withDatabase(async (db) => {
      await db.exec(await source('0000_virtual_temple.sql'));
      await seed(db);
      await migrate(db);
      await verifyDataAndPrivacy(db);
      await migrate(db);
      await verifyDataAndPrivacy(db);
    });
  }, 30_000);

  it('repairs a database initialized by PR #1 and enforces both missing CHECK constraints', async () => {
    await withDatabase(async (db) => {
      await db.exec(await legacySource());
      await seed(db);
      await migrate(db);
      await verifyDataAndPrivacy(db);
      await migrate(db);
      await verifyDataAndPrivacy(db);
    });
  }, 30_000);

  it('rolls back constraint repair on invalid legacy data without deleting or rewriting rows', async () => {
    await withDatabase(async (db) => {
      await db.exec(await legacySource());
      await db.query('INSERT INTO vto_players(id,name,avatar) VALUES ($1,$2,$3)', [playerId, 'Kept legacy player', 2]);
      await db.query('INSERT INTO vto_prayers(id,player_id,name,text) VALUES ($1,$1,$2,$3)', [playerId, 'Kept legacy player', '']);
      await expect(migrate(db)).rejects.toMatchObject({ code: '23514' });
      expect((await db.query('SELECT avatar FROM vto_players WHERE id=$1', [playerId])).rows).toEqual([{ avatar: 2 }]);
      expect((await db.query('SELECT text FROM vto_prayers WHERE id=$1', [playerId])).rows).toEqual([{ text: '' }]);
      // Avatar repair precedes prayer repair inside the same DO transaction.
      // The later failure must roll back the earlier ADD CONSTRAINT too.
      expect((await db.query("SELECT conname FROM pg_constraint WHERE conname='vto_players_avatar_range'")).rows).toEqual([]);
    });
  }, 30_000);
});
