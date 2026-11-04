import { describe, it, expect } from 'vitest';
import { TempleRoom } from './room';
import type { ClientMessage, ServerMessage } from '../src/lib/protocol';

function fixture() {
  let now = 10_000;
  const room = new TempleRoom('test', () => now);
  const out = new Map<string, ServerMessage[]>();
  const closed: string[] = [];
  function connect(id: string) {
    const messages: ServerMessage[] = [];
    out.set(id, messages);
    return room.connect(id, { send: (message) => messages.push(message), close: () => closed.push(id) });
  }
  function send(id: string, message: ClientMessage) { room.receive(id, JSON.stringify(message)); }
  function join(id: string) { connect(id); send(id, { type: 'join', name: `Guest ${id}`, avatar: 0 }); }
  function advance(ms: number) { now += ms; room.tick(); }
  function move(id: string, x: number, z: number) {
    // Each increment is physically reachable under server speed validation.
    let player = room.players().find((p) => p.id === id)!;
    while (Math.hypot(player.x - x, player.z - z) > .01) {
      const dx = x - player.x; const dz = z - player.z; const length = Math.hypot(dx, dz); const step = Math.min(length, .6);
      advance(100); send(id, { type: 'move', x: player.x + dx / length * step, z: player.z + dz / length * step, yaw: 0, animation: 'walk' });
      player = room.players().find((p) => p.id === id)!;
    }
  }
  return { room, out, closed, join, send, connect, advance, move };
}

describe('authoritative temple room', () => {
  it('caps total connections at 20, counts pending joins and releases seats on disconnect', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) expect(f.connect(String(i))).toBe(true);
    expect(f.connect('overflow')).toBe(false);
    expect(f.closed).toContain('overflow');
    f.room.disconnect('0');
    expect(f.connect('new')).toBe(true);
  });

  it('rejects malformed, NaN, out-of-bounds and teleport moves without corrupting state', () => {
    const f = fixture(); f.join('a'); const original = f.room.players()[0];
    f.advance(100);
    f.send('a', { type: 'move', x: 24, z: 0, yaw: 0, animation: 'run' });
    f.room.receive('a', '{"type":"move","x":null,"z":0,"yaw":0,"animation":"run"}');
    f.send('a', { type: 'move', x: 1000, z: 0, yaw: 0, animation: 'run' });
    expect(f.room.players()[0]).toMatchObject({ x: original.x, z: original.z });
    f.send('a', { type: 'move', x: original.x + .5, z: original.z, yaw: 0, animation: 'walk' });
    expect(f.room.players()[0].x).toBeCloseTo(original.x + .5);
  });

  it('broadcasts chat and throttles consecutive messages', () => {
    const f = fixture(); f.join('a'); f.join('b');
    f.send('a', { type: 'chat', text: 'Xin chào' });
    f.send('a', { type: 'chat', text: 'spam' });
    expect(f.out.get('b')!.filter((m) => m.type === 'chat')).toHaveLength(1);
    expect(f.out.get('a')!.some((m) => m.type === 'error')).toBe(true);
    f.advance(1300); f.send('a', { type: 'chat', text: 'Nam mô' });
    expect(f.out.get('b')!.filter((m) => m.type === 'chat')).toHaveLength(2);
  });

  it('locks movement during meditation until an explicit idle action', () => {
    const f = fixture(); f.join('a');
    f.send('a', { type: 'action', action: 'sit' });
    f.advance(1000);
    f.send('a', { type: 'move', x: 1, z: 16, yaw: 0, animation: 'walk' });
    expect(f.room.players()[0]).toMatchObject({ x: 0, animation: 'sit' });
    f.send('a', { type: 'action', action: 'idle' });
    f.send('a', { type: 'move', x: 1, z: 16, yaw: 0, animation: 'walk' });
    expect(f.room.players()[0]).toMatchObject({ x: 1, animation: 'walk' });
  });

  it('permits combat only for two consenting nearby players inside the arena and respawns KO', () => {
    const f = fixture(); f.join('a'); f.join('b');
    f.send('a', { type: 'combat', enabled: true });
    expect(f.room.players()[0].inCombat).toBe(false);
    f.move('a', 18, 5); f.move('b', 19, 5);
    f.send('a', { type: 'combat', enabled: true });
    f.send('a', { type: 'attack', targetId: 'b' });
    expect(f.room.players().find((p) => p.id === 'b')!.hp).toBe(100);
    f.send('b', { type: 'combat', enabled: true });
    f.advance(800); f.send('a', { type: 'attack', targetId: 'b' });
    expect(f.room.players().find((p) => p.id === 'b')!.hp).toBe(86);
    f.send('a', { type: 'attack', targetId: 'b' });
    expect(f.room.players().find((p) => p.id === 'b')!.hp).toBe(86);
    for (let i = 0; i < 7; i++) { f.advance(800); f.send('a', { type: 'attack', targetId: 'b' }); }
    expect(f.room.players().find((p) => p.id === 'b')).toMatchObject({ hp: 0, inCombat: false });
    f.advance(5001);
    expect(f.room.players().find((p) => p.id === 'b')).toMatchObject({ hp: 100, x: 0, z: 16, animation: 'idle' });
  });

  it('does not broadcast incense when the player is away from the altar', () => {
    const f = fixture(); f.join('a'); f.send('a', { type: 'action', action: 'incense' });
    expect(f.out.get('a')!.filter((m) => m.type === 'event')).toHaveLength(0);
    f.move('a', 0, -12); f.send('a', { type: 'action', action: 'incense' });
    expect(f.out.get('a')!.some((m) => m.type === 'event' && m.event === 'incense')).toBe(true);
  });

  it('rejects tunnelling through a temple wall even when a move is within the speed budget', () => {
    const f = fixture(); f.join('a'); f.move('a', 6, -9);
    f.advance(1000);
    f.send('a', { type: 'move', x: 8.6, z: -9, yaw: 0, animation: 'run' });
    expect(f.room.players()[0]).toMatchObject({ x: 6, z: -9 });
  });
});
