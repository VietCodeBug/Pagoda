import { TempleRoom } from './room';
import { signGameToken, verifyGameToken } from '../src/lib/game-signing';
import type { GameSessionTicket } from '../src/lib/game-progress';

export function createGameRoom(roomId: string, secret?: string) {
  return new TempleRoom(roomId, Date.now, secret && secret.length >= 32 ? async (profileId, reward) =>
    signGameToken(secret, { kind: 'reward', profileId, reward, expiresAt: Date.now() + 10 * 60_000 }) : undefined);
}
/** Old clients can still move/chat; only verified guests can receive persistent rewards. */
export async function receiveGameMessage(room: TempleRoom, id: string, message: string, secret?: string) {
  let data;
  try { data = JSON.parse(message); } catch { room.receive(id, message); return; }
  if (data?.type === 'join' && typeof data.ticket === 'string') {
    const ticket = await verifyGameToken<GameSessionTicket>(secret || '', data.ticket);
    if (ticket?.kind === 'session' && typeof ticket.profileId === 'string' && /^[0-9a-f-]{36}$/i.test(ticket.profileId)
      && Number.isFinite(ticket.expiresAt) && ticket.expiresAt > Date.now() && ticket.expiresAt <= Date.now() + 20 * 60_000) {
      room.authorize(id, ticket.profileId);
    }
  }
  room.receive(id, message);
}
