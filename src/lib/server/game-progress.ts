import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { ActivityMode, ActivityReward } from '../activities';
import type { GameProgress } from '../game-progress';
import { claimRewardStatement } from './game-progress-sql';

function sql() {
  const url = process.env.DATABASE_URL || process.env.NEON_KEY;
  if (!url) throw new Error('Persistent game progress is unavailable.');
  return neon(url);
}
export async function loadGameProgress(profileId: string): Promise<GameProgress> {
  const db = sql();
  const [wallets, fish, scores] = await db.transaction([
    db`SELECT coins,xp FROM vto_game_wallets WHERE player_id=${profileId}::uuid`,
    db`SELECT species_id AS "speciesId",amount,best_size AS "bestSize" FROM vto_fish_collection WHERE player_id=${profileId}::uuid ORDER BY species_id`,
    db`SELECT mode,plays,best_score AS "bestScore",total_score AS "totalScore" FROM vto_activity_scores WHERE player_id=${profileId}::uuid ORDER BY mode`,
  ]);
  return { coins: Number(wallets[0]?.coins || 0), xp: Number(wallets[0]?.xp || 0), fish: fish as GameProgress['fish'], scores: scores as {mode:ActivityMode;plays:number;bestScore:number;totalScore:number}[] };
}
export async function claimGameReward(profileId: string, reward: ActivityReward) {
  const statement = claimRewardStatement(profileId, reward);
  const result = await sql().query(statement.query, statement.params);
  return { applied: result[0]?.applied === true, progress: await loadGameProgress(profileId) };
}
