import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import type { ActivityReward } from './activities';
import { isGameReward, type GameRewardTicket } from './game-progress';
import { signGameToken, verifyGameToken } from './game-signing';
import { applyMigrations, MIGRATION_FILES } from './migrations';
import { claimRewardStatement } from './server/game-progress-sql';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const signingKey = 'test-only-room-reward-key-with-more-than-32-characters';
const reward = (changes: Partial<ActivityReward> = {}): ActivityReward => ({ id: crypto.randomUUID(), mode: 'fishing', coins: 5, xp: 7, score: 25, fish: { speciesId: 'garden-koi', size: 32.5 }, ...changes });

async function withDatabase(run: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anonymous; CREATE ROLE authenticated;');
    // Simulate a Data API that grants new tables by default: the migration must revoke them.
    await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anonymous, authenticated;');
    await applyMigrations([...MIGRATION_FILES], (file) => readFile(`drizzle/${file}`, 'utf8'), async (statements) => {
      await db.transaction(async (tx) => { for (const statement of statements) await tx.exec(statement); });
    });
    await db.query('INSERT INTO vto_players(id,name) VALUES ($1,$2),($3,$4)', [owner, 'QA reward owner', other, 'QA other profile']);
    await run(db);
  } finally { await db.close(); }
}

async function claim(db: PGlite, playerId: string, value: ActivityReward) {
  const statement = claimRewardStatement(playerId, value);
  const result = await db.query<{ applied: boolean }>(statement.query, statement.params);
  return result.rows[0].applied;
}

describe('signed game reward boundary', () => {
  it('authenticates immutable owner, purpose, expiry and reward fields without accepting a different key', async () => {
    const payload: GameRewardTicket = { kind: 'reward', profileId: owner, expiresAt: Date.now() + 60_000, reward: reward() };
    const token = await signGameToken(signingKey, payload);
    expect(await verifyGameToken<GameRewardTicket>(signingKey, token)).toEqual(payload);
    expect(await verifyGameToken('a-different-test-only-key-at-least-32-characters', token)).toBeNull();
    expect(token).not.toContain(signingKey);
    expect(token).not.toContain(owner);
  });

  it('rejects modified bodies/signatures and malformed or oversized receipts', async () => {
    const payload: GameRewardTicket = { kind: 'reward', profileId: owner, expiresAt: Date.now() + 60_000, reward: reward() };
    const token = await signGameToken(signingKey, payload);
    const [body, signature] = token.split('.');
    const tampered = { ...payload, profileId: other, reward: { ...payload.reward, coins: 2000 } };
    const changedBody = Buffer.from(JSON.stringify(tampered)).toString('base64url');
    const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    expect(await verifyGameToken(signingKey, `${changedBody}.${signature}`)).toBeNull();
    expect(await verifyGameToken(signingKey, `${body}.${changedSignature}`)).toBeNull();
    for (const invalid of ['', 'not-a-token', 'a.b.c', '***.!!!', 'a'.repeat(10_001)]) expect(await verifyGameToken(signingKey, invalid)).toBeNull();
    await expect(signGameToken('short', payload)).rejects.toThrow('not configured');
    expect(await verifyGameToken('short', token)).toBeNull();
  });

  it('bounds rewards and rejects unknown fish instead of creating arbitrary collection entries', () => {
    expect(isGameReward(reward())).toBe(true);
    expect(isGameReward(reward({ mode: 'race', score: 12_500, fish: undefined }))).toBe(true);
    for (const invalid of [
      reward({ coins: -1 }), reward({ coins: 2001 }), reward({ xp: 1001 }), reward({ score: 1_000_001 }),
      reward({ score: NaN }), reward({ coins: 1.5 }), reward({ id: 'fake-receipt' }),
      reward({ fish: undefined }), reward({ mode: 'training' }),
      reward({ fish: { speciesId: 'made-up-fish', size: 25 } }),
      reward({ fish: { speciesId: 'garden-koi', size: Infinity } }),
      reward({ fish: { speciesId: 'garden-koi', size: 0 } }),
      reward({ fish: { speciesId: 'garden-koi', size: 1001 } }),
    ]) expect(isGameReward(invalid)).toBe(false);
    expect(isGameReward({ ...reward(), mode: 'client-invented-mode' })).toBe(false);
  });
});

describe('game reward redemption in real in-memory PostgreSQL', () => {
  it('applies a receipt once across retries and other profiles without duplicating wallet, fish or score', async () => {
    await withDatabase(async (db) => {
      const value = reward();
      expect(await claim(db, owner, value)).toBe(true);
      expect(await claim(db, owner, value)).toBe(false);
      expect(await claim(db, other, value)).toBe(false);
      expect((await db.query('SELECT coins,xp FROM vto_game_wallets WHERE player_id=$1', [owner])).rows).toEqual([{ coins: 5, xp: 7 }]);
      expect((await db.query('SELECT amount,best_size FROM vto_fish_collection WHERE player_id=$1', [owner])).rows).toEqual([{ amount: 1, best_size: 32.5 }]);
      expect((await db.query('SELECT plays,best_score,total_score FROM vto_activity_scores WHERE player_id=$1', [owner])).rows).toEqual([{ plays: 1, best_score: 25, total_score: 25 }]);
      expect((await db.query('SELECT * FROM vto_game_wallets WHERE player_id=$1', [other])).rows).toEqual([]);
      expect((await db.query('SELECT * FROM vto_fish_collection WHERE player_id=$1', [other])).rows).toEqual([]);
      expect((await db.query('SELECT count(*)::int AS count FROM vto_game_claims')).rows).toEqual([{ count: 1 }]);
    });
  }, 30_000);

  it('keeps exact totals under concurrent distinct receipts and concurrent replay of one receipt', async () => {
    await withDatabase(async (db) => {
      const first = reward({ coins: 3, xp: 4 });
      const second = reward({ coins: 8, xp: 9 });
      const results = await Promise.all([
        claim(db, owner, first), claim(db, owner, second),
        claim(db, owner, first), claim(db, owner, second), claim(db, owner, first),
      ]);
      expect(results.filter(Boolean)).toHaveLength(2);
      expect((await db.query('SELECT coins,xp FROM vto_game_wallets WHERE player_id=$1', [owner])).rows).toEqual([{ coins: 11, xp: 13 }]);
      expect((await db.query('SELECT amount FROM vto_fish_collection WHERE player_id=$1', [owner])).rows).toEqual([{ amount: 2 }]);
      expect((await db.query('SELECT plays,total_score FROM vto_activity_scores WHERE player_id=$1', [owner])).rows).toEqual([{ plays: 2, total_score: 50 }]);
      expect((await db.query('SELECT count(*)::int AS count FROM vto_game_claims')).rows).toEqual([{ count: 2 }]);
    });
  }, 30_000);

  it('retains the fastest race and largest fish while counting all legitimate completions', async () => {
    await withDatabase(async (db) => {
      for (const score of [12_000, 9800, 15_000]) await claim(db, owner, reward({ mode: 'race', score, fish: undefined }));
      for (const size of [30, 45, 35]) await claim(db, owner, reward({ fish: { speciesId: 'garden-koi', size } }));
      expect((await db.query('SELECT plays,best_score,total_score FROM vto_activity_scores WHERE player_id=$1 AND mode=$2', [owner, 'race'])).rows).toEqual([{ plays: 3, best_score: 9800, total_score: 36_800 }]);
      expect((await db.query('SELECT amount,best_size FROM vto_fish_collection WHERE player_id=$1', [owner])).rows).toEqual([{ amount: 3, best_size: 45 }]);
      expect((await db.query('SELECT plays,best_score,total_score FROM vto_activity_scores WHERE player_id=$1 AND mode=$2', [owner, 'fishing'])).rows).toEqual([{ plays: 3, best_score: 25, total_score: 75 }]);
    });
  }, 30_000);

  it('revokes Data API roles from wallets, claims, collections and scores even with permissive default grants', async () => {
    await withDatabase(async (db) => {
      await claim(db, owner, reward());
      for (const role of ['anonymous', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`);
        try {
          for (const table of ['vto_game_wallets', 'vto_game_claims', 'vto_fish_collection', 'vto_activity_scores']) {
            await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toMatchObject({ code: '42501' });
          }
          // The existing deliberately public projection remains readable.
          expect((await db.query('SELECT * FROM public.vto_public_prayers')).rows).toEqual([]);
        } finally { await db.exec('RESET ROLE'); }
      }
    });
  }, 30_000);

  it('rolls back the receipt ledger and every related write if any reward write fails', async () => {
    await withDatabase(async (db) => {
      const invalid = reward({ coins: -1 });
      await expect(claim(db, owner, invalid)).rejects.toMatchObject({ code: '23514' });
      for (const table of ['vto_game_wallets', 'vto_game_claims', 'vto_fish_collection', 'vto_activity_scores']) {
        expect((await db.query(`SELECT count(*)::int AS count FROM public.${table}`)).rows).toEqual([{ count: 0 }]);
      }
      expect(await claim(db, owner, { ...invalid, coins: 5 })).toBe(true);
    });
  }, 30_000);
});
