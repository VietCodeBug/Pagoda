/** The wire format is shared by the browser, local WebSocket server and Worker. */
import type { ActivityInput, ActivityState, RoomActivityState, ActivityEffect, ActivityReward } from './activities';
export const ROOM_CAPACITY = 20;
export const PRESENCE_HEARTBEAT_MS = 10_000;
export const PRESENCE_TIMEOUT_MS = 60_000;
export const ROOM_IDS = ['lotus-1', 'lotus-2', 'lotus-3'] as const;
export const MAX_HP = 100;
export const SPAWN = { x: 0, z: 16 };
export const ARENA = { minX: 14, maxX: 24, minZ: 0, maxZ: 12 };
export const WORLD_BOUNDS = { minX: -28, maxX: 28, minZ: -30, maxZ: 26 };

export type AnimationName = 'idle' | 'walk' | 'run' | 'sit' | 'bow' | 'pray' | 'attack' | 'wave' | 'fish';
export type PlayerAction = 'sit' | 'bow' | 'pray' | 'incense' | 'bell' | 'wave' | 'idle';
export type Player = {
  id: string;
  name: string;
  avatar: number;
  x: number;
  z: number;
  yaw: number;
  animation: AnimationName;
  hp: number;
  inCombat: boolean;
  respawnAt?: number;
};
export type ChatMessage = { id: string; playerId: string; name: string; text: string; at: number };
export type ClientMessage =
  | { type: 'join'; name: string; avatar: number; ticket?: string; clientId?: string }
  | { type: 'leave' }
  | { type: 'move'; x: number; z: number; yaw: number; animation: AnimationName }
  | { type: 'chat'; text: string }
  | { type: 'action'; action: PlayerAction }
  | { type: 'emote'; emoji: string }
  | { type: 'combat'; enabled: boolean }
  | { type: 'attack'; targetId?: string }
  | { type: 'ping' }
  | ActivityInput;
export type GameEvent = {
  type: 'event';
  event: 'incense' | 'bell' | 'emote' | 'hit' | 'respawn';
  playerId: string;
  targetId?: string;
  emoji?: string;
  at: number;
};
export type ServerMessage =
  | { type: 'welcome'; id: string; players: Player[]; roomId: string; capacity: number }
  | { type: 'state'; players: Player[]; at: number }
  | ({ type: 'chat' } & ChatMessage)
  | GameEvent
  | { type: 'error'; message: string }
  | { type: 'pong'; at: number }
  | { type: 'heartbeat'; at: number }
  | ActivityServerMessage;
export type ActivityServerMessage =
  | { type: 'activity_state'; state: ActivityState }
  | { type: 'activity_room'; room: RoomActivityState }
  | { type: 'activity_effect'; effect: ActivityEffect }
  | { type: 'activity_reward'; reward: ActivityReward; receipt: string | null };

export function insideArena(position: Pick<Player, 'x' | 'z'>): boolean {
  return position.x >= ARENA.minX && position.x <= ARENA.maxX && position.z >= ARENA.minZ && position.z <= ARENA.maxZ;
}
