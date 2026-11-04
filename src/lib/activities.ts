/** Shared game rules and display data. Outcomes are decided by the room server. */
export const ACTIVITY_IDS = ['fishing', 'fishing-contest', 'lotus-hunt', 'race', 'memory', 'lanterns', 'training', 'duel'] as const;
export type ActivityMode = typeof ACTIVITY_IDS[number];
export type ActivityPhase = 'idle' | 'waiting' | 'bite' | 'playing' | 'finished';
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Point = { x: number; z: number };

export const FISHING_SPOT = { x: -8.7, z: 6 };
export const LANTERN_SPOT = { x: -8.5, z: 12.5 };
export const TRAINING_SPOT = { x: 20, z: 2 };
export const MEMORY_SPOT = { x: 10, z: -2.7 };
export const MEMORY_STEP_MS = 650;
export const FISHING_RULES = { minimumWaitMs: 2400, maximumWaitMs: 6200, biteWindowMs: 1800, cooldownMs: 1000 } as const;

export const FISH_RARITIES: Record<FishRarity, { name: string; color: string; weight: number; score: number }> = {
  common: { name: 'Phổ thông', color: '#b6c4b1', weight: 57, score: 10 },
  uncommon: { name: 'Đặc biệt', color: '#83ceac', weight: 25, score: 25 },
  rare: { name: 'Hiếm', color: '#79b7ef', weight: 12, score: 60 },
  epic: { name: 'Sử thi', color: '#c79beb', weight: 5, score: 140 },
  legendary: { name: 'Huyền thoại', color: '#f1c36e', weight: 1, score: 350 },
};
export type FishSpecies = { id: string; name: string; rarity: FishRarity; minSize: number; maxSize: number; weight: number };
export const FISH_SPECIES: readonly FishSpecies[] = [
  { id: 'silver-carp', name: 'Cá diếc bạc', rarity: 'common', minSize: 12, maxSize: 28, weight: 45 },
  { id: 'perch', name: 'Cá rô đồng', rarity: 'common', minSize: 10, maxSize: 24, weight: 35 },
  { id: 'grass-carp', name: 'Cá trắm cỏ', rarity: 'common', minSize: 24, maxSize: 58, weight: 20 },
  { id: 'red-carp', name: 'Cá chép đỏ', rarity: 'uncommon', minSize: 20, maxSize: 42, weight: 45 },
  { id: 'garden-koi', name: 'Koi vườn thiền', rarity: 'uncommon', minSize: 24, maxSize: 48, weight: 35 },
  { id: 'golden-catfish', name: 'Cá trê vàng', rarity: 'uncommon', minSize: 28, maxSize: 62, weight: 20 },
  { id: 'butterfly-koi', name: 'Koi bướm', rarity: 'rare', minSize: 30, maxSize: 65, weight: 60 },
  { id: 'jade-carp', name: 'Cá chép ngọc', rarity: 'rare', minSize: 26, maxSize: 54, weight: 40 },
  { id: 'moon-koi', name: 'Koi ánh trăng', rarity: 'epic', minSize: 38, maxSize: 78, weight: 60 },
  { id: 'golden-arowana', name: 'Kim long', rarity: 'epic', minSize: 45, maxSize: 92, weight: 40 },
  { id: 'lotus-carp', name: 'Cá chép hoa sen', rarity: 'legendary', minSize: 48, maxSize: 98, weight: 65 },
  { id: 'azure-dragonfish', name: 'Long ngư lam', rarity: 'legendary', minSize: 65, maxSize: 125, weight: 35 },
];
export type FishCatch = { speciesId: string; size: number };
export function fishSpecies(id: string) { return FISH_SPECIES.find((fish) => fish.id === id); }
export function fishScore(catchResult: FishCatch) {
  const species = fishSpecies(catchResult.speciesId);
  return species ? FISH_RARITIES[species.rarity].score : 0;
}

export const LOTUS_POINTS: readonly (Point & { id: string })[] = [
  { id: 'lotus-1', x: 5, z: 17 }, { id: 'lotus-2', x: -5, z: 16 },
  { id: 'lotus-3', x: 6, z: 9 }, { id: 'lotus-4', x: -6, z: 6 },
  { id: 'lotus-5', x: 5, z: 1 }, { id: 'lotus-6', x: -5, z: -3 },
  { id: 'lotus-7', x: 0, z: -4 }, { id: 'lotus-8', x: 8, z: 14 },
  { id: 'lotus-9', x: 12, z: 16 }, { id: 'lotus-10', x: -8, z: 14 },
];
export const RACE_CHECKPOINTS: readonly Point[] = [
  { x: 0, z: 19.5 }, { x: -6, z: 15 }, { x: -6, z: 3 }, { x: -5, z: -3 },
  { x: 5, z: -3 }, { x: 8.5, z: 2 }, { x: 8, z: 14 }, { x: 0, z: 17 },
];
export const MEMORY_NOTES = [
  { name: 'Đất', color: '#c99771', frequency: 261.63 },
  { name: 'Nước', color: '#78b8d7', frequency: 329.63 },
  { name: 'Gió', color: '#99c998', frequency: 392.0 },
  { name: 'Mây', color: '#c1a0db', frequency: 523.25 },
] as const;

export const ACTIVITY_MODES: readonly { id: ActivityMode; name: string; description: string; location: Point; radius: number; durationMs: number; icon: string }[] = [
  { id: 'fishing', name: 'Câu cá thư giãn', description: 'Thả câu, chờ cá cắn rồi giật cần đúng lúc. 12 loài, 5 độ hiếm.', location: FISHING_SPOT, radius: 2.4, durationMs: 0, icon: 'fish' },
  { id: 'fishing-contest', name: 'Hội câu cá', description: 'Cùng phòng thi câu trong 3 phút. Cá càng hiếm càng nhiều điểm.', location: FISHING_SPOT, radius: 2.4, durationMs: 180_000, icon: 'trophy' },
  { id: 'lotus-hunt', name: 'Săn sen', description: 'Tìm đủ 10 đóa sen trên các lối đi trước khi hết 90 giây.', location: { x: 0, z: 16 }, radius: 4, durationMs: 90_000, icon: 'flower' },
  { id: 'race', name: 'Đường đua an nhiên', description: 'Chạy qua 8 cổng theo thứ tự. Đua thời gian với thành tích của bạn.', location: { x: 0, z: 17 }, radius: 3, durationMs: 120_000, icon: 'flag' },
  { id: 'memory', name: 'Nhớ tiếng chuông', description: 'Nghe, nhớ rồi nhắc lại giai điệu. Hoàn thành 5 vòng.', location: MEMORY_SPOT, radius: 3.2, durationMs: 90_000, icon: 'music' },
  { id: 'lanterns', name: 'Đêm hội thả đèn', description: 'Cả phòng cùng thả 12 đèn trong 90 giây. Một mình vẫn chơi được.', location: LANTERN_SPOT, radius: 2.8, durationMs: 90_000, icon: 'lantern' },
  { id: 'training', name: 'Luyện quyền', description: 'Luyện những cú đấm vào mộc nhân trong 30 giây. Không gây hại người khác.', location: TRAINING_SPOT, radius: 3, durationMs: 30_000, icon: 'target' },
  { id: 'duel', name: 'Đấu tay đôi', description: 'Vào võ đài, bật giao đấu rồi so tài với người cùng đồng ý.', location: { x: 19, z: 6 }, radius: 5, durationMs: 0, icon: 'swords' },
];
export function activityDefinition(mode: ActivityMode) { return ACTIVITY_MODES.find((entry) => entry.id === mode)!; }

export type ActivityInput = {
  type: 'activity';
  action: 'start' | 'cast' | 'reel' | 'collect' | 'checkpoint' | 'note' | 'lantern' | 'strike' | 'leave';
  mode?: ActivityMode;
  targetId?: string;
  index?: number;
};
export type ActivityState = {
  mode: ActivityMode | null;
  phase: ActivityPhase;
  score: number;
  startedAt: number;
  endsAt: number;
  message: string;
  readyAt?: number;
  biteUntil?: number;
  nextCastAt?: number;
  sequence?: number[];
  inputIndex?: number;
  round?: number;
  checkpoint?: number;
  collected?: string[];
  lastCatch?: FishCatch;
};
export type ActivityReward = {
  id: string;
  mode: ActivityMode;
  coins: number;
  xp: number;
  score: number;
  fish?: FishCatch;
};
export type ActivityLeaderboardEntry = { playerId: string; name: string; score: number; catches: number };
export type RoomActivityState = {
  contest: { id: string; phase: 'running' | 'finished'; startedAt: number; endsAt: number; leaderboard: ActivityLeaderboardEntry[] } | null;
  lanterns: { id: string; phase: 'running' | 'finished'; startedAt: number; endsAt: number; count: number; target: number; participants: number } | null;
  at: number;
};
export type ActivityEffect = {
  kind: 'cast' | 'catch' | 'lotus' | 'checkpoint' | 'note' | 'lantern' | 'strike';
  playerId: string;
  x: number;
  z: number;
  at: number;
  fish?: FishCatch;
  index?: number;
};
export const EMPTY_ACTIVITY: ActivityState = { mode: null, phase: 'idle', score: 0, startedAt: 0, endsAt: 0, message: 'Chọn một hoạt động để bắt đầu.' };
