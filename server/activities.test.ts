import { describe, expect, it } from 'vitest';
import { Activities } from './activities';
import {
  ACTIVITY_MODES, FISHING_SPOT, FISH_RARITIES, LANTERN_SPOT, LOTUS_POINTS,
  MEMORY_SPOT, RACE_CHECKPOINTS, TRAINING_SPOT, fishSpecies,
  type ActivityEffect, type ActivityInput, type ActivityReward, type ActivityState, type RoomActivityState,
} from '../src/lib/activities';
import { isWalkable } from '../src/lib/world-layout';

function fixture(random: () => number = () => 0) {
  let now = 10_000;
  const players = new Map<string, { x: number; z: number; hp: number; inCombat: boolean; name: string }>();
  const states = new Map<string, ActivityState>();
  const rooms: RoomActivityState[] = [];
  const rewards: { playerId: string; reward: ActivityReward }[] = [];
  const effects: ActivityEffect[] = [];
  const engine = new Activities({
    getPlayer: (id) => players.get(id),
    sendState: (id, state) => { states.set(id, state); },
    broadcastRoom: (state) => { rooms.push(state); },
    broadcastEffect: (effect) => { effects.push(effect); },
    reward: (playerId, reward) => { rewards.push({ playerId, reward }); },
  }, () => now, random);
  const add = (id: string, point = { x: 0, z: 16 }) => { players.set(id, { ...point, hp: 100, inCombat: false, name: `Guest ${id}` }); engine.join(id); };
  const send = (id: string, input: Omit<ActivityInput, 'type'>) => engine.receive(id, { type: 'activity', ...input });
  const advance = (ms: number) => { now += ms; engine.tick(); };
  const position = (id: string, point: { x: number; z: number }) => Object.assign(players.get(id)!, point);
  const state = (id = 'a') => engine.getState(id)!;
  const catchFish = (id = 'a') => { send(id, { action: 'cast' }); advance(state(id).readyAt! - now); send(id, { action: 'reel' }); };
  return { engine, players, states, rooms, rewards, effects, add, send, advance, position, state, catchFish, now: () => now };
}

describe('authoritative activity catalogue', () => {
  it('places activity anchors, collectables and checkpoints on traversable ground', () => {
    expect(ACTIVITY_MODES).toHaveLength(8);
    for (const point of [...ACTIVITY_MODES.map((mode) => mode.location), ...LOTUS_POINTS, ...RACE_CHECKPOINTS]) {
      expect(isWalkable(point.x, point.z, .28), JSON.stringify(point)).toBe(true);
    }
    expect(Object.values(FISH_RARITIES).reduce((sum, tier) => sum + tier.weight, 0)).toBe(100);
  });
});

describe('room fishing', () => {
  it('rejects fake or early reels, consumes a cast once and applies the cast cooldown', () => {
    const f = fixture(); f.add('a', FISHING_SPOT);
    f.send('a', { action: 'reel' }); expect(f.rewards).toHaveLength(0);
    f.send('a', { action: 'start', mode: 'fishing' });
    f.send('a', { action: 'cast' });
    expect(f.engine.isMovementLocked('a')).toBe(true);
    f.send('a', { action: 'reel' });
    expect(f.rewards).toHaveLength(0); expect(f.state().phase).toBe('idle');
    expect(f.engine.isMovementLocked('a')).toBe(false);
    f.send('a', { action: 'cast' }); expect(f.state().phase).toBe('idle');
    f.advance(1000); f.catchFish();
    expect(f.rewards).toHaveLength(1);
    expect(f.rewards[0].reward.mode).toBe('fishing');
    expect(f.rewards[0].reward.fish).toBeDefined();
    f.send('a', { action: 'reel' }); f.send('a', { action: 'reel' });
    expect(f.rewards).toHaveLength(1);
  });

  it('requires the player to remain at the fishing bank and expires missed bites', () => {
    const f = fixture(); f.add('a');
    f.send('a', { action: 'start', mode: 'fishing' }); expect(f.state().mode).toBeNull();
    f.position('a', FISHING_SPOT); f.send('a', { action: 'start', mode: 'fishing' });
    f.send('a', { action: 'cast' }); f.position('a', { x: 0, z: 16 }); f.advance(100);
    expect(f.state().phase).toBe('idle'); expect(f.rewards).toHaveLength(0);
    f.position('a', FISHING_SPOT); f.advance(1000); f.send('a', { action: 'cast' });
    f.advance(f.state().biteUntil! - f.now() + 1); f.send('a', { action: 'reel' });
    expect(f.state().phase).toBe('idle'); expect(f.rewards).toHaveLength(0);
  });

  it('preserves cast and lantern cooldowns when the client leaves and restarts the activity', () => {
    const f = fixture(); f.add('a', FISHING_SPOT); f.send('a', { action: 'start', mode: 'fishing' });
    f.catchFish(); f.send('a', { action: 'leave' }); f.send('a', { action: 'start', mode: 'fishing' });
    f.send('a', { action: 'cast' }); expect(f.state().phase).toBe('idle');
    f.advance(1000); f.send('a', { action: 'cast' }); expect(f.state().phase).toBe('waiting');
    f.send('a', { action: 'leave' }); f.advance(1000); f.position('a', LANTERN_SPOT);
    f.send('a', { action: 'start', mode: 'lanterns' }); f.send('a', { action: 'lantern' });
    expect(f.engine.snapshot().lanterns!.count).toBe(1);
    f.send('a', { action: 'leave' }); f.advance(800); f.send('a', { action: 'start', mode: 'lanterns' });
    f.send('a', { action: 'lantern' }); expect(f.engine.snapshot().lanterns!.count).toBe(1);
    f.advance(1200); f.send('a', { action: 'lantern' }); expect(f.engine.snapshot().lanterns!.count).toBe(2);
  });

  it('rolls all five rarities on the server, keeps sizes within species bounds and issues unique rewards', () => {
    let rolls: number[] = [];
    const f = fixture(() => rolls.shift() ?? 0);
    f.add('a', FISHING_SPOT); f.send('a', { action: 'start', mode: 'fishing' });
    for (const [rarity, rarityRoll] of [['common', 0], ['uncommon', .6], ['rare', .85], ['epic', .96], ['legendary', .995]] as const) {
      rolls = [0, rarityRoll, 0, .5];
      f.catchFish();
      const fish = f.rewards.at(-1)!.reward.fish!;
      const species = fishSpecies(fish.speciesId)!;
      expect(species.rarity).toBe(rarity);
      expect(fish.size).toBeGreaterThanOrEqual(species.minSize);
      expect(fish.size).toBeLessThanOrEqual(species.maxSize);
      expect(f.rewards.at(-1)!.reward.score).toBe(FISH_RARITIES[rarity].score);
      f.advance(1000);
    }
    expect(new Set(f.rewards.map((entry) => entry.reward.id)).size).toBe(5);
  });

  it('shares a tournament leaderboard, separates catch prizes from the final bonus and finishes only once', () => {
    const f = fixture(); const otherRoom = fixture();
    f.add('a', FISHING_SPOT); f.add('b', FISHING_SPOT);
    f.send('a', { action: 'start', mode: 'fishing-contest' });
    const endsAt = f.engine.snapshot().contest!.endsAt;
    f.send('b', { action: 'start', mode: 'fishing-contest' });
    f.advance(1000); f.send('a', { action: 'start', mode: 'fishing-contest' });
    expect(f.engine.snapshot().contest!.endsAt).toBe(endsAt);
    f.catchFish('a'); f.catchFish('b'); f.advance(1000); f.catchFish('b');
    const running = f.engine.snapshot().contest!;
    expect(running.leaderboard.map((entry) => [entry.playerId, entry.catches])).toEqual([['b', 2], ['a', 1]]);
    expect(otherRoom.engine.snapshot().contest).toBeNull();
    f.advance(endsAt - f.now());
    const prizes = f.rewards.filter((entry) => entry.reward.mode === 'fishing-contest');
    expect(prizes).toHaveLength(2);
    expect(prizes.every((entry) => !entry.reward.fish)).toBe(true);
    expect(prizes.find((entry) => entry.playerId === 'b')!.reward.coins).toBe(60);
    expect(f.state('a').phase).toBe('finished'); expect(f.state('b').phase).toBe('finished');
    const count = f.rewards.length; f.advance(10_000); f.send('a', { action: 'reel' });
    expect(f.rewards).toHaveLength(count);
  });
});

describe('exploration and memory challenges', () => {
  it('checks lotus proximity, prevents picking one target twice and rewards one completed route', () => {
    const f = fixture(); f.add('a'); f.send('a', { action: 'start', mode: 'lotus-hunt' });
    f.send('a', { action: 'collect', targetId: LOTUS_POINTS[0].id }); expect(f.state().collected).toEqual([]);
    for (const point of LOTUS_POINTS) {
      f.position('a', point); f.advance(500); f.send('a', { action: 'collect', targetId: point.id });
      const count = f.state().collected?.length;
      f.send('a', { action: 'collect', targetId: point.id }); expect(f.state().collected).toHaveLength(count!);
    }
    expect(f.state().phase).toBe('finished'); expect(f.rewards).toHaveLength(1);
    expect(f.rewards[0].reward).toMatchObject({ mode: 'lotus-hunt', score: 100 });
    f.advance(90_000); expect(f.rewards).toHaveLength(1);
  });

  it('requires every race checkpoint in order and persists elapsed time rather than client scores', () => {
    const f = fixture(); f.add('a', { x: 0, z: 17 }); f.send('a', { action: 'start', mode: 'race' });
    f.position('a', RACE_CHECKPOINTS[3]); f.send('a', { action: 'checkpoint', index: 3 });
    expect(f.state().checkpoint).toBe(0);
    f.send('a', { action: 'checkpoint', index: 0 }); expect(f.state().checkpoint).toBe(0);
    RACE_CHECKPOINTS.forEach((point, index) => { f.position('a', point); f.advance(1000); f.send('a', { action: 'checkpoint', index }); });
    expect(f.state().phase).toBe('finished'); expect(f.rewards).toHaveLength(1);
    expect(f.rewards[0].reward).toMatchObject({ mode: 'race', score: 8000 });
    f.send('a', { action: 'checkpoint', index: 7 }); expect(f.rewards).toHaveLength(1);
  });

  it('gates memory input until playback, checks sequence order and completes all five rounds once', () => {
    const f = fixture(); f.add('a', MEMORY_SPOT); f.send('a', { action: 'start', mode: 'memory' });
    f.send('a', { action: 'note', index: f.state().sequence![0] }); expect(f.state().inputIndex).toBe(0);
    for (let round = 1; round <= 5; round++) {
      const current = f.state(); expect(current.round).toBe(round);
      f.advance(current.readyAt! - f.now());
      for (const index of current.sequence!) { f.advance(150); f.send('a', { action: 'note', index }); }
    }
    expect(f.state().phase).toBe('finished'); expect(f.state().score).toBe(25);
    expect(f.rewards).toHaveLength(1); expect(f.rewards[0].reward.mode).toBe('memory');
    f.send('a', { action: 'note', index: 0 }); f.advance(90_000); expect(f.rewards).toHaveLength(1);
  });

  it('fails a wrong memory note and refuses to award a challenge after leaving its anchor', () => {
    const f = fixture(); f.add('a', MEMORY_SPOT); f.send('a', { action: 'start', mode: 'memory' });
    f.advance(f.state().readyAt! - f.now());
    f.send('a', { action: 'note', index: (f.state().sequence![0] + 1) % 4 });
    expect(f.state().phase).toBe('finished'); expect(f.rewards).toHaveLength(0);
    f.advance(1000); f.send('a', { action: 'start', mode: 'memory' });
    f.position('a', { x: 0, z: 16 }); f.advance(100);
    expect(f.state().phase).toBe('finished'); expect(f.rewards).toHaveLength(0);
  });
});

describe('cooperative lanterns and training', () => {
  it('enforces per-player lantern cooldown and rewards contributors once when the shared goal is reached', () => {
    const f = fixture(); f.add('a', LANTERN_SPOT); f.add('b', LANTERN_SPOT);
    f.send('a', { action: 'start', mode: 'lanterns' }); f.send('b', { action: 'start', mode: 'lanterns' });
    f.send('a', { action: 'lantern' }); f.send('a', { action: 'lantern' });
    expect(f.engine.snapshot().lanterns!.count).toBe(1);
    f.send('b', { action: 'lantern' });
    for (let round = 0; round < 5; round++) { f.advance(2000); f.send('a', { action: 'lantern' }); f.send('b', { action: 'lantern' }); }
    expect(f.engine.snapshot().lanterns).toMatchObject({ count: 12, phase: 'finished' });
    expect(f.rewards).toHaveLength(2);
    expect(f.rewards.every((entry) => entry.reward.mode === 'lanterns' && entry.reward.score === 6)).toBe(true);
    f.send('a', { action: 'lantern' }); f.advance(90_000); expect(f.rewards).toHaveLength(2);
  });

  it('lets a solo player complete the cooperative lantern goal without additional players', () => {
    const f = fixture(); f.add('a', LANTERN_SPOT); f.send('a', { action: 'start', mode: 'lanterns' });
    for (let count = 0; count < 12; count++) { if (count) f.advance(2000); f.send('a', { action: 'lantern' }); }
    expect(f.state().phase).toBe('finished'); expect(f.rewards).toHaveLength(1);
    expect(f.rewards[0].reward.score).toBe(12);
  });

  it('throttles training strikes, does not reset its deadline and awards only when the round expires', () => {
    const f = fixture(); f.add('a', TRAINING_SPOT); f.send('a', { action: 'start', mode: 'training' });
    const deadline = f.state().endsAt;
    f.send('a', { action: 'strike' }); f.send('a', { action: 'strike' }); expect(f.state().score).toBe(1);
    f.advance(700); f.send('a', { action: 'strike' }); expect(f.state().score).toBe(2);
    f.send('a', { action: 'start', mode: 'training' }); expect(f.state().endsAt).toBe(deadline);
    expect(f.rewards).toHaveLength(0);
    f.advance(deadline - f.now()); expect(f.state().phase).toBe('finished');
    expect(f.rewards).toHaveLength(1); expect(f.rewards[0].reward).toMatchObject({ mode: 'training', score: 2 });
    f.advance(30_000); expect(f.rewards).toHaveLength(1);
  });

  it('cancels a non-combat challenge on death or entering combat and never mints a prize', () => {
    const f = fixture(); f.add('a', TRAINING_SPOT); f.send('a', { action: 'start', mode: 'training' });
    f.send('a', { action: 'strike' }); f.players.get('a')!.inCombat = true; f.advance(100);
    expect(f.state().phase).toBe('finished'); expect(f.rewards).toHaveLength(0);
    f.players.get('a')!.inCombat = false; f.position('a', FISHING_SPOT); f.advance(1000);
    f.send('a', { action: 'start', mode: 'fishing' }); f.send('a', { action: 'cast' }); f.players.get('a')!.hp = 0; f.advance(5000);
    f.send('a', { action: 'reel' }); expect(f.rewards).toHaveLength(0); expect(f.engine.isMovementLocked('a')).toBe(false);
  });
});
