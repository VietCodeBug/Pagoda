import type { ActivityMode, ActivityReward } from './activities';
import { fishSpecies } from './activities';

export type GameProgress = {
  coins: number;
  xp: number;
  fish: { speciesId: string; amount: number; bestSize: number }[];
  scores: { mode: ActivityMode; plays: number; bestScore: number; totalScore: number }[];
};
export const emptyGameProgress = (): GameProgress => ({ coins: 0, xp: 0, fish: [], scores: [] });
export type GameSessionTicket = { kind: 'session'; profileId: string; expiresAt: number };
export type GameRewardTicket = { kind: 'reward'; profileId: string; expiresAt: number; reward: ActivityReward };

export const GAME_MODES = ['fishing', 'fishing-contest', 'lotus-hunt', 'race', 'memory', 'lanterns', 'training', 'duel'] as const;
export function isGameReward(value: unknown): value is ActivityReward {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  const integer = (n: unknown, max: number) => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= max;
  if (typeof r.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.id)) return false;
  if (!(GAME_MODES as readonly unknown[]).includes(r.mode) || !integer(r.coins, 2000) || !integer(r.xp, 1000) || !integer(r.score, 1_000_000)) return false;
  if (r.fish !== undefined) {
    if (!r.fish || typeof r.fish !== 'object') return false;
    const fish = r.fish as Record<string, unknown>;
    if (typeof fish.speciesId !== 'string' || !fishSpecies(fish.speciesId) || typeof fish.size !== 'number' || !Number.isFinite(fish.size) || fish.size <= 0 || fish.size > 1000 || r.mode!=='fishing') return false;
  }
  if(r.mode==='fishing'&&!r.fish)return false;
  return true;
}
