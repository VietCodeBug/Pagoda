import type { ActivityReward } from '../activities';

/** All writes depend on accepted, so an opaque receipt can be redeemed only once. */
export function claimRewardStatement(profileId: string, reward: ActivityReward) {
  return {
    params: [reward.id, profileId, reward.mode, reward.coins, reward.xp, reward.score,
      reward.fish?.speciesId ?? null, reward.fish?.size ?? null, JSON.stringify(reward)],
    query: `WITH accepted AS (
      INSERT INTO vto_game_claims(id,player_id,mode,reward)
      VALUES ($1::uuid,$2::uuid,$3,$9::jsonb)
      ON CONFLICT (id) DO NOTHING RETURNING player_id
    ), wallet AS (
      INSERT INTO vto_game_wallets(player_id,coins,xp)
      SELECT player_id,$4::int,$5::int FROM accepted
      ON CONFLICT (player_id) DO UPDATE SET
        coins=vto_game_wallets.coins+excluded.coins,
        xp=vto_game_wallets.xp+excluded.xp, updated_at=now()
      RETURNING player_id
    ), fish AS (
      INSERT INTO vto_fish_collection(player_id,species_id,amount,best_size)
      SELECT player_id,$7::varchar,1,$8::float8 FROM accepted WHERE $7::varchar IS NOT NULL
      ON CONFLICT (player_id,species_id) DO UPDATE SET
        amount=vto_fish_collection.amount+1,
        best_size=greatest(vto_fish_collection.best_size,excluded.best_size)
      RETURNING player_id
    ), score AS (
      INSERT INTO vto_activity_scores(player_id,mode,plays,best_score,total_score)
      SELECT player_id,$3,1,$6::int,$6::int FROM accepted
      ON CONFLICT (player_id,mode) DO UPDATE SET
        plays=vto_activity_scores.plays+1,
        best_score=CASE WHEN excluded.mode='race'
          THEN least(vto_activity_scores.best_score,excluded.best_score)
          ELSE greatest(vto_activity_scores.best_score,excluded.best_score) END,
        total_score=vto_activity_scores.total_score+excluded.total_score
      RETURNING player_id
    ) SELECT EXISTS(SELECT 1 FROM accepted) AS applied`,
  };
}
