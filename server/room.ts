import { z } from 'zod';
import { insideArena, MAX_HP, ROOM_CAPACITY, SPAWN, WORLD_BOUNDS, type AnimationName, type ClientMessage, type Player, type ServerMessage } from '../src/lib/protocol';
import { isWalkable } from '../src/lib/world-layout';
import { normalizeDisplayName, normalizeMessage } from '../src/lib/validation';

const animation = z.enum(['idle', 'walk', 'run', 'sit', 'bow', 'pray', 'attack', 'wave']);
const input = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name: z.string().max(24).transform(normalizeDisplayName).pipe(z.string().min(1).max(24)), avatar: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal('move'), x: z.number().finite().min(WORLD_BOUNDS.minX).max(WORLD_BOUNDS.maxX), z: z.number().finite().min(WORLD_BOUNDS.minZ).max(WORLD_BOUNDS.maxZ), yaw: z.number().finite().min(-100).max(100), animation }),
  z.object({ type: z.literal('chat'), text: z.string().max(240).transform(normalizeMessage).pipe(z.string().min(1).max(240)) }),
  z.object({ type: z.literal('action'), action: z.enum(['sit', 'bow', 'pray', 'incense', 'bell', 'wave', 'idle']) }),
  z.object({ type: z.literal('emote'), emoji: z.enum(['🙏', '🌸', '❤️', '👋', '✨', '😊']) }),
  z.object({ type: z.literal('combat'), enabled: z.boolean() }),
  z.object({ type: z.literal('attack'), targetId: z.string().max(100).optional() }),
  z.object({ type: z.literal('ping') }),
]);
type Connection = { send: (message: ServerMessage) => void; close: (code: number, reason: string) => void };
type Session = { connection: Connection; player?: Player; movedAt: number; chatAt: number; actionAt: number; attackAt: number; emoteAt: number; lockUntil: number; messageTimes: number[]; joinedAt: number };
type Clock = () => number;

/** All authority lives here; transports only deliver bytes. No movement is stored in Neon. */
export class TempleRoom {
  private sessions = new Map<string, Session>();
  private dirty = false;
  constructor(readonly roomId: string, private readonly clock: Clock = Date.now) {}

  connect(id: string, connection: Connection) {
    if (this.sessions.size >= ROOM_CAPACITY) {
      connection.send({ type: 'error', message: 'Phòng đã đủ 20 người. Hãy chọn phòng khác.' });
      connection.close(4001, 'Room full');
      return false;
    }
    const now = this.clock();
    this.sessions.set(id, { connection, movedAt: now, chatAt: -Infinity, actionAt: -Infinity, attackAt: -Infinity, emoteAt: -Infinity, lockUntil: 0, messageTimes: [], joinedAt: now });
    return true;
  }

  disconnect(id: string) {
    if (this.sessions.delete(id)) this.broadcastState();
  }

  players() { return Array.from(this.sessions.values()).flatMap((session) => session.player ? [{ ...session.player }] : []); }
  get size() { return this.sessions.size; }

  receive(id: string, raw: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    const now = this.clock();
    session.messageTimes = session.messageTimes.filter((at) => now - at < 1000);
    if (session.messageTimes.length >= 35) return;
    session.messageTimes.push(now);
    if (raw.length > 2048) return this.error(session, 'Gói tin quá lớn.');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return this.error(session, 'Gói tin không hợp lệ.'); }
    const result = input.safeParse(parsed);
    if (!result.success) return this.error(session, 'Dữ liệu không hợp lệ.');
    this.handle(id, session, result.data as ClientMessage, now);
  }

  private handle(id: string, session: Session, message: ClientMessage, now: number) {
    if (message.type === 'ping') return session.connection.send({ type: 'pong', at: now });
    if (message.type === 'join') {
      if (session.player) return;
      session.player = { id, name: message.name, avatar: message.avatar, x: SPAWN.x + (this.players().length % 4) * 1.2, z: SPAWN.z, yaw: Math.PI, animation: 'idle', hp: MAX_HP, inCombat: false };
      session.connection.send({ type: 'welcome', id, players: this.players(), roomId: this.roomId, capacity: ROOM_CAPACITY });
      this.broadcastState();
      return;
    }
    const player = session.player;
    if (!player || player.hp <= 0) return;
    if (message.type === 'move') {
      if (now < session.lockUntil || now - session.movedAt < 65) return;
      const elapsed = Math.min((now - session.movedAt) / 1000, 1);
      const distance = Math.hypot(message.x - player.x, message.z - player.z);
      // Token time prevents repeated 0.5m teleports exploiting per-packet slack.
      if (distance > 9.5 * elapsed + 0.16) return this.error(session, 'Di chuyển quá nhanh.');
      if (!['idle', 'walk', 'run'].includes(message.animation)) return;
      const segments = Math.max(1, Math.ceil(distance / .2));
      for (let step = 1; step <= segments; step++) {
        const ratio = step / segments;
        if (!isWalkable(player.x + (message.x - player.x) * ratio, player.z + (message.z - player.z) * ratio, .25)) return;
      }
      player.x = message.x; player.z = message.z; player.yaw = message.yaw; player.animation = message.animation;
      session.movedAt = now;
      if (!insideArena(player)) player.inCombat = false;
      this.dirty = true;
      return;
    }
    if (message.type === 'chat') {
      if (now - session.chatAt < 1200) return this.error(session, 'Hãy chờ một chút trước khi gửi tiếp.');
      session.chatAt = now;
      this.broadcast({ type: 'chat', id: crypto.randomUUID(), playerId: id, name: player.name, text: message.text, at: now });
      return;
    }
    if (message.type === 'combat') {
      if (message.enabled && !insideArena(player)) return this.error(session, 'Đến võ đài để bật giao đấu.');
      player.inCombat = message.enabled;
      if (!message.enabled) player.hp = MAX_HP;
      this.broadcastState();
      return;
    }
    if (message.type === 'attack') {
      if (!player.inCombat || !insideArena(player) || now - session.attackAt < 700 || now < session.lockUntil) return;
      session.attackAt = now; player.animation = 'attack'; session.lockUntil = now + 450;
      const candidates = this.players().filter((other) => other.id !== id && other.inCombat && other.hp > 0 && insideArena(other));
      const target = message.targetId ? candidates.find((other) => other.id === message.targetId) : candidates.sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
      if (target && Math.hypot(target.x - player.x, target.z - player.z) <= 2.4) {
        const actual = this.sessions.get(target.id)!.player!;
        actual.hp = Math.max(0, actual.hp - 14);
        if (actual.hp === 0) { actual.respawnAt = now + 5000; actual.animation = 'bow'; actual.inCombat = false; }
        this.broadcast({ type: 'event', event: 'hit', playerId: id, targetId: target.id, at: now });
      }
      this.broadcastState();
      return;
    }
    if (message.type === 'emote') {
      if (now - session.emoteAt < 2000) return;
      session.emoteAt = now;
      this.broadcast({ type: 'event', event: 'emote', playerId: id, emoji: message.emoji, at: now });
      return;
    }
    if (message.type === 'action') {
      if (message.action === 'idle') { player.animation = 'idle'; session.lockUntil = 0; this.broadcastState(); return; }
      if (now - session.actionAt < 1300 || now < session.lockUntil) return;
      // Interaction range is checked on the server as well as in the UI.
      if (message.action === 'incense' && Math.hypot(player.x, player.z + 14) > 7) return this.error(session, 'Đến gần bàn hương để dâng hương.');
      if (message.action === 'bell' && Math.hypot(player.x - 10, player.z + 3) > 5) return this.error(session, 'Đến gần tháp chuông.');
      session.actionAt = now;
      player.animation = (message.action === 'incense' ? 'pray' : message.action === 'bell' ? 'bow' : message.action) as AnimationName;
      session.lockUntil = message.action === 'sit' ? Infinity : now + (message.action === 'pray' || message.action === 'incense' ? 3500 : 1800);
      if (message.action === 'incense' || message.action === 'bell') this.broadcast({ type: 'event', event: message.action, playerId: id, at: now });
      this.broadcastState();
    }
  }

  tick() {
    const now = this.clock();
    for (const [id, session] of this.sessions) {
      if (!session.player && now - session.joinedAt > 10_000) { session.connection.close(4002, 'Join timeout'); this.sessions.delete(id); continue; }
      const player = session.player;
      if (!player) continue;
      if (player.respawnAt && now >= player.respawnAt) {
        Object.assign(player, { hp: MAX_HP, inCombat: false, x: SPAWN.x, z: SPAWN.z, animation: 'idle', respawnAt: undefined });
        session.movedAt = now; session.lockUntil = 0;
        this.dirty = true;
        this.broadcast({ type: 'event', event: 'respawn', playerId: id, at: now });
      } else if (session.lockUntil !== Infinity && now >= session.lockUntil && ['attack', 'pray', 'bow', 'wave'].includes(player.animation)) {
        player.animation = 'idle';
        this.dirty = true;
      }
    }
    if (this.sessions.size && this.dirty) this.broadcastState();
  }

  private error(session: Session, message: string) { session.connection.send({ type: 'error', message }); }
  private broadcast(message: ServerMessage) { for (const session of this.sessions.values()) session.connection.send(message); }
  private broadcastState() { this.dirty = false; this.broadcast({ type: 'state', players: this.players(), at: this.clock() }); }
}
