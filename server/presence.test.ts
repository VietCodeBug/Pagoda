import { describe, expect, it } from 'vitest';
import { TempleRoom } from './room';
import { receiveGameMessage } from './game-transport';
import { signGameToken } from '../src/lib/game-signing';
import { LANTERN_SPOT } from '../src/lib/activities';
import { findPath } from '../src/lib/world-layout';
import { PRESENCE_HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, type ClientMessage, type ServerMessage } from '../src/lib/protocol';

const profile = '779026bd-57fb-4bc3-89d3-31d9daf68310';
const tab = '91ffde82-31db-4019-aa25-cf9bac113ec5';
const otherTab = '988ec0b3-c1a2-4aa7-a081-8150994c2204';

function fixture() {
  let now = 10_000;
  const room = new TempleRoom('presence', () => now);
  const peers = new Map<string, { messages: ServerMessage[]; closes: number[]; broken: boolean; brokenClose: boolean }>();
  const send = (id: string, message: ClientMessage) => room.receive(id, JSON.stringify(message));
  function connect(id: string) {
    const peer = { messages: [] as ServerMessage[], closes: [] as number[], broken: false, brokenClose: false };
    peers.set(id, peer);
    room.connect(id, {
      send(message) { if (peer.broken) throw new Error('Socket already closed'); peer.messages.push(message); },
      close(code) { peer.closes.push(code); if (peer.brokenClose) throw new Error('Close already finished'); },
    });
    return peer;
  }
  function join(id: string, profileId?: string, clientId?: string) {
    const peer = connect(id);
    if (profileId) room.authorize(id, profileId);
    send(id, { type: 'join', name: 'Same name', avatar: 0, clientId });
    return peer;
  }
  function advance(ms: number) { now += ms; room.tick(); }
  function walk(id: string, target: { x: number; z: number }) {
    const initial = room.players().find(player => player.id === id)!;
    for (const [x, z] of findPath(initial.x, initial.z, target.x, target.z)) {
      const from = room.players().find(player => player.id === id)!;
      const steps = Math.ceil(Math.hypot(x - from.x, z - from.z) / .55);
      for (let step = 1; step <= steps; step++) {
        advance(100);
        send(id, { type: 'move', x: from.x + (x - from.x) * step / steps, z: from.z + (z - from.z) * step / steps, yaw: 0, animation: 'walk' });
      }
    }
  }
  return { room, peers, send, connect, join, advance, walk };
}

describe('room presence and reconnection', () => {
  it('removes a closed activity participant before broadcasts can hit the closed socket', () => {
    const f = fixture();
    const leaving = f.join('leaving');
    const observer = f.join('observer');
    f.walk('leaving', LANTERN_SPOT);
    f.send('leaving', { type: 'activity', action: 'start', mode: 'lanterns' });
    expect(f.room.activities.snapshot().lanterns?.participants).toBe(1);
    leaving.broken = true;
    leaving.brokenClose = true;

    expect(() => f.room.disconnect('leaving')).not.toThrow();
    expect(f.room.players().map(player => player.id)).toEqual(['observer']);
    expect(f.room.activities.snapshot().lanterns?.participants).toBe(0);
    expect(f.room.activities.getState('leaving').mode).toBeNull();
    expect(observer.messages.at(-1)).toMatchObject({ type: 'state', players: [{ id: 'observer' }] });
    f.room.disconnect('leaving');
    expect(f.room.size).toBe(1);
  });

  it('isolates a failed send and reclaims its seat even when close throws', () => {
    const f = fixture();
    const dead = f.join('dead');
    const observer = f.join('observer');
    dead.broken = true; dead.brokenClose = true;
    expect(() => f.send('observer', { type: 'chat', text: 'Still here' })).not.toThrow();
    expect(observer.messages.at(-1)).toMatchObject({ type: 'chat', text: 'Still here' });
    expect(() => f.advance(100)).not.toThrow();
    expect(f.room.players().map(player => player.id)).toEqual(['observer']);
    expect(dead.closes).toContain(4002);
    expect(observer.messages.at(-1)).toMatchObject({ type: 'state', players: [{ id: 'observer' }] });
  });

  it('handles leave immediately and cannot recreate a departed session from late messages', () => {
    const f = fixture();
    const leaving = f.join('leaving');
    const observer = f.join('observer');
    f.send('leaving', { type: 'leave' });
    expect(leaving.closes).toContain(1000);
    expect(f.room.size).toBe(1);
    expect(observer.messages.at(-1)).toMatchObject({ type: 'state', players: [{ id: 'observer' }] });
    f.room.authorize('leaving', profile);
    f.send('leaving', { type: 'join', name: 'Late packet', avatar: 0, clientId: tab });
    f.send('leaving', { type: 'leave' });
    expect(f.room.size).toBe(1);
  });

  it('expires a silent socket while heartbeats keep an idle meditator present', () => {
    const f = fixture();
    const silent = f.join('silent');
    const awake = f.join('awake');
    f.send('awake', { type: 'action', action: 'sit' });
    for (let elapsed = 0; elapsed < PRESENCE_TIMEOUT_MS; elapsed += PRESENCE_HEARTBEAT_MS) {
      f.advance(PRESENCE_HEARTBEAT_MS);
      f.send('awake', { type: 'ping' });
    }
    expect(silent.closes).toContain(4002);
    expect(f.room.players()).toMatchObject([{ id: 'awake', animation: 'sit' }]);
    expect(awake.messages.some(message => message.type === 'heartbeat')).toBe(true);
    expect(awake.messages.at(-1)).toMatchObject({ type: 'pong' });
    expect(awake.messages.filter(message => message.type === 'state').at(-1)).toMatchObject({ players: [{ id: 'awake' }] });
  });

  it('does not renew a lease with malformed packets or let pings hold an unjoined seat', () => {
    const f = fixture();
    const pending = f.connect('pending');
    f.send('pending', { type: 'ping' });
    f.advance(10_000);
    expect(pending.closes).toContain(4002);
    expect(f.room.size).toBe(0);
    const invalid = f.join('invalid');
    for (let elapsed = 0; elapsed < PRESENCE_TIMEOUT_MS; elapsed += 10_000) {
      f.room.receive('invalid', '{"type":"unknown"}');
      f.advance(10_000);
    }
    expect(invalid.closes).toContain(4002);
    expect(f.room.size).toBe(0);
  });

  it('replaces only the verified previous connection for the same tab', () => {
    const f = fixture();
    const old = f.join('old', profile, tab);
    f.join('observer', profile, otherTab);
    f.join('new', profile, tab);
    expect(old.closes).toContain(4005);
    expect(f.room.players().map(player => player.id).sort()).toEqual(['new', 'observer']);
    f.room.disconnect('old');
    expect(f.room.players().map(player => player.id).sort()).toEqual(['new', 'observer']);
  });

  it('keeps different tabs, different profiles and unverified guests distinct', () => {
    const f = fixture();
    f.join('first', profile, tab);
    f.join('second-tab', profile, otherTab);
    f.join('other-profile', '1f6d0428-9e29-431a-a378-0242689c7cd0', tab);
    f.join('unverified', undefined, tab);
    expect(f.room.size).toBe(4);
    expect(f.room.players()).toHaveLength(4);
    for (const peer of f.peers.values()) expect(peer.closes).toEqual([]);
  });

  it('spawns a returning player clear of an avatar still standing at the entrance', () => {
    const f = fixture();
    f.join('first'); f.join('observer');
    f.room.disconnect('first');
    f.join('returning');
    const [observer, returning] = f.room.players();
    expect(Math.hypot(observer.x-returning.x,observer.z-returning.z)).toBeGreaterThan(1);
    for (let i=0;i<18;i++) f.join(`guest-${i}`);
    expect(f.room.players()).toHaveLength(20);
    const positions=f.room.players().map(player=>`${player.x},${player.z}`);
    expect(new Set(positions).size).toBe(20);
  });

  it('never allows a forged profile ticket to evict a verified player', async () => {
    const f = fixture();
    const original = f.join('original', profile, tab);
    const secret = 'presence-test-signing-secret-32-characters';
    const ticket = await signGameToken('a-different-signing-secret-32-characters', { kind: 'session', profileId: profile, expiresAt: Date.now() + 60_000 });
    f.connect('attacker');
    await receiveGameMessage(f.room, 'attacker', JSON.stringify({ type: 'join', name: 'Same name', avatar: 0, clientId: tab, ticket }), secret);
    expect(original.closes).toEqual([]);
    expect(f.room.players()).toHaveLength(2);
  });

  it('ignores an authenticated join whose connection left during ticket verification', async () => {
    const f = fixture();
    const secret = 'presence-test-signing-secret-32-characters';
    const ticket = await signGameToken(secret, { kind: 'session', profileId: profile, expiresAt: Date.now() + 60_000 });
    f.connect('late');
    const verifying = receiveGameMessage(f.room, 'late', JSON.stringify({ type: 'join', name: 'Late guest', avatar: 0, clientId: tab, ticket }), secret);
    f.room.disconnect('late');
    await verifying;
    expect(f.room.size).toBe(0);
    expect(f.room.players()).toEqual([]);
  });
});
