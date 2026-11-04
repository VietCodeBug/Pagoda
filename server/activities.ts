import {
  ACTIVITY_IDS, EMPTY_ACTIVITY, FISH_RARITIES, FISH_SPECIES, FISHING_RULES,
  FISHING_SPOT, LANTERN_SPOT, LOTUS_POINTS, MEMORY_NOTES, MEMORY_STEP_MS,
  RACE_CHECKPOINTS, activityDefinition, fishScore, fishSpecies,
  type ActivityEffect, type ActivityInput, type ActivityLeaderboardEntry, type ActivityMode,
  type ActivityReward, type ActivityState, type FishCatch, type FishRarity, type RoomActivityState,
} from '../src/lib/activities';

type Participant = { x: number; z: number; hp: number; inCombat: boolean; name: string };
export type ActivityHooks = {
  getPlayer: (id: string) => Participant | undefined;
  sendState: (id: string, state: ActivityState) => void;
  broadcastRoom: (state: RoomActivityState) => void;
  broadcastEffect: (effect: ActivityEffect) => void;
  reward: (id: string, reward: ActivityReward) => void;
};
type Session = { state: ActivityState; lastInputAt: number; lastStartAt: number; lastLanternAt: number; nextCastAt: number };
type Contest = { id: string; phase: 'running' | 'finished'; startedAt: number; endsAt: number; entries: Map<string, ActivityLeaderboardEntry> };
type LanternChallenge = { id: string; phase: 'running' | 'finished'; startedAt: number; endsAt: number; count: number; target: number; contributions: Map<string, number> };
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const copyState = (state: ActivityState): ActivityState => ({
  ...state,
  ...(state.sequence ? { sequence: [...state.sequence] } : {}),
  ...(state.collected ? { collected: [...state.collected] } : {}),
  ...(state.lastCatch ? { lastCatch: { ...state.lastCatch } } : {}),
});

/** The room owns time, fish rolls, checkpoints and rewards. Inputs never carry scores. */
export class Activities {
  private sessions = new Map<string, Session>();
  private contest: Contest | null = null;
  private lanterns: LanternChallenge | null = null;

  constructor(private hooks: ActivityHooks, private clock: () => number = Date.now, private random: () => number = Math.random) {}

  join(id: string) {
    if (!this.sessions.has(id)) this.sessions.set(id, { state: { ...EMPTY_ACTIVITY }, lastInputAt: -Infinity, lastStartAt: -Infinity, lastLanternAt: -Infinity, nextCastAt: 0 });
    this.emit(id);
  }

  leave(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    this.removeParticipation(id, session.state);
  }

  getState(id: string): ActivityState { return copyState(this.sessions.get(id)?.state ?? EMPTY_ACTIVITY); }

  snapshot(): RoomActivityState {
    return {
      contest: this.contest ? {
        id: this.contest.id, phase: this.contest.phase, startedAt: this.contest.startedAt, endsAt: this.contest.endsAt,
        leaderboard: [...this.contest.entries.values()].map((entry) => ({ ...entry })).sort((a, b) => b.score - a.score || b.catches - a.catches || a.playerId.localeCompare(b.playerId)),
      } : null,
      lanterns: this.lanterns ? {
        id: this.lanterns.id, phase: this.lanterns.phase, startedAt: this.lanterns.startedAt, endsAt: this.lanterns.endsAt,
        count: this.lanterns.count, target: this.lanterns.target, participants: this.lanterns.contributions.size,
      } : null,
      at: this.clock(),
    };
  }

  /** Used by the room movement validator while a cast is in progress. */
  isMovementLocked(id: string) {
    const state = this.sessions.get(id)?.state;
    return Boolean(state && (state.mode === 'fishing' || state.mode === 'fishing-contest') && (state.phase === 'waiting' || state.phase === 'bite'));
  }

  receive(id: string, input: ActivityInput) {
    this.tick();
    const session = this.sessions.get(id);
    const player = this.hooks.getPlayer(id);
    if (!session || !player) return;
    if (input.action === 'leave') {
      this.removeParticipation(id, session.state);
      session.state = { ...EMPTY_ACTIVITY };
      this.emit(id);
      return;
    }
    if (player.hp <= 0 || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return this.message(id, 'Hãy chờ hồi phục rồi tham gia hoạt động.');
    if (input.action === 'start') {
      if (!input.mode || !(ACTIVITY_IDS as readonly string[]).includes(input.mode)) return this.message(id, 'Hoạt động chưa hợp lệ.');
      this.start(id, input.mode, player, session);
      return;
    }
    if (!session.state.mode || session.state.phase === 'finished') return this.message(id, 'Chọn hoạt động trước khi bắt đầu.');
    if (player.inCombat) return this.message(id, 'Rời giao đấu trước khi chơi hoạt động này.');
    if (input.action === 'cast') return this.cast(id, player, session);
    if (input.action === 'reel') return this.reel(id, player, session);
    if (input.action === 'collect') return this.collect(id, player, session, input.targetId);
    if (input.action === 'checkpoint') return this.checkpoint(id, player, session, input.index);
    if (input.action === 'note') return this.note(id, player, session, input.index);
    if (input.action === 'lantern') return this.lantern(id, player, session);
    if (input.action === 'strike') return this.strike(id, player, session);
  }

  tick(now = this.clock()) {
    // Dead players and combat cannot continue a different activity in the background.
    for (const [id, session] of this.sessions) {
      const state = session.state;
      if (!state.mode || state.phase === 'finished') continue;
      const player = this.hooks.getPlayer(id);
      if (!player || player.hp <= 0 || (player.inCombat && state.mode !== 'duel')) {
        this.removeParticipation(id, state);
        this.finish(id, 'Hoạt động đã dừng. Hãy hồi phục và thử lại.');
        continue;
      }
      if ((state.mode === 'fishing' || state.mode === 'fishing-contest') && (state.phase === 'waiting' || state.phase === 'bite')) {
        if (distance(player, FISHING_SPOT) > 2.4) {
          this.resetCast(session, now, 'Bạn đã rời bờ hồ. Hãy quay lại để thả câu.'); this.emit(id);
        } else if (now > (state.biteUntil ?? Infinity)) {
          this.resetCast(session, now, 'Cá đã bơi mất. Thả câu để thử lại nhé.'); this.emit(id);
        } else if (state.phase === 'waiting' && now >= (state.readyAt ?? Infinity)) {
          state.phase = 'bite'; state.message = 'Cá cắn câu! Giật cần ngay!'; this.emit(id);
        }
      }
      if (state.mode === 'training' || state.mode === 'memory') {
        const definition = activityDefinition(state.mode);
        if (distance(player, definition.location) > definition.radius) {
          this.finish(id, 'Bạn đã rời khu vực thử thách.'); continue;
        }
      }
      if (state.endsAt > 0 && now >= state.endsAt) {
        if (state.mode === 'training') {
          const score = state.score;
          this.finish(id, `Hoàn thành luyện quyền · ${score} cú đấm.`);
          if (score > 0) this.award(id, 'training', score, Math.max(2, Math.floor(score / 2)), 8 + score);
        } else if (state.mode === 'lotus-hunt') {
          const score = state.score;
          this.finish(id, `Hết giờ · tìm được ${state.collected?.length ?? 0}/${LOTUS_POINTS.length} đóa sen.`);
          if (score > 0) this.award(id, 'lotus-hunt', score, Math.max(1, Math.floor(score / 5)), Math.floor(score / 2));
        } else if (state.mode === 'race' || state.mode === 'memory') this.finish(id, 'Hết thời gian. Chọn thử lại để chinh phục lượt mới.');
      }
    }
    if (this.contest?.phase === 'running' && now >= this.contest.endsAt) this.finishContest(now);
    if (this.lanterns?.phase === 'running' && now >= this.lanterns.endsAt) this.finishLanterns(false);
  }

  private start(id: string, mode: ActivityMode, player: Participant, session: Session) {
    const now = this.clock();
    if (player.inCombat && mode !== 'duel') return this.message(id, 'Rời giao đấu trước khi chơi hoạt động khác.');
    const definition = activityDefinition(mode);
    if (distance(player, definition.location) > definition.radius) return this.message(id, `Đến ${definition.name.toLowerCase()} trên bản đồ để bắt đầu.`);
    if (session.state.mode === mode && session.state.phase !== 'finished') { this.emit(id); return; }
    if (now - session.lastStartAt < 800) return this.message(id, 'Chờ một chút trước khi đổi hoạt động.');
    if (mode === 'fishing-contest' && this.contest?.phase === 'finished' && now < this.contest.endsAt + 5000) return this.message(id, 'Hội câu vừa kết thúc. Chờ 5 giây để mở lượt mới.');
    if (mode === 'lanterns' && this.lanterns?.phase === 'finished' && now < this.lanterns.endsAt + 5000) return this.message(id, 'Chờ 5 giây để mở đêm hội tiếp theo.');
    this.removeParticipation(id, session.state);
    session.lastStartAt = now;
    session.lastInputAt = -Infinity;
    session.state = { mode, phase: 'playing', score: 0, startedAt: now, endsAt: definition.durationMs ? now + definition.durationMs : 0, message: definition.description };
    const state = session.state;
    if (mode === 'fishing' || mode === 'fishing-contest') {
      state.phase = 'idle'; state.nextCastAt = Math.max(now, session.nextCastAt); state.message = 'Đứng bên hồ và nhấn Thả câu.';
      if (mode === 'fishing-contest') {
        if (!this.contest || this.contest.phase === 'finished') this.contest = { id: crypto.randomUUID(), phase: 'running', startedAt: now, endsAt: now + 180_000, entries: new Map() };
        this.contest.entries.set(id, { playerId: id, name: player.name, score: 0, catches: 0 });
        state.endsAt = this.contest.endsAt;
        state.message = 'Đã vào hội câu! Thả câu để ghi điểm cho bảng xếp hạng.';
        this.publishRoom();
      }
    } else if (mode === 'lotus-hunt') state.collected = [];
    else if (mode === 'race') { state.checkpoint = 0; state.message = 'Chạy qua cổng sáng số 1 để bắt đầu hành trình.'; }
    else if (mode === 'memory') {
      state.sequence = Array.from({ length: 3 }, () => this.rollNote());
      state.inputIndex = 0; state.round = 1;
      state.readyAt = now + state.sequence.length * MEMORY_STEP_MS + 400;
      state.message = 'Lắng nghe giai điệu, rồi nhắc lại theo đúng thứ tự.';
    } else if (mode === 'lanterns') {
      if (!this.lanterns || this.lanterns.phase === 'finished') this.lanterns = { id: crypto.randomUUID(), phase: 'running', startedAt: now, endsAt: now + 90_000, count: 0, target: 12, contributions: new Map() };
      this.lanterns.contributions.set(id, 0);
      state.endsAt = this.lanterns.endsAt;
      state.message = `Cùng thả ${this.lanterns.target} chiếc đèn. Mỗi người thả một đèn mỗi 2 giây.`;
      this.publishRoom();
    } else if (mode === 'training') state.message = 'Nhấn Đấm vào mộc nhân. Mỗi cú cách nhau ít nhất 0,7 giây.';
    else if (mode === 'duel') state.message = 'Bật giao đấu ở võ đài và chỉ so tài với người cùng đồng ý.';
    this.emit(id);
  }

  private cast(id: string, player: Participant, session: Session) {
    const state = session.state; const now = this.clock();
    if ((state.mode !== 'fishing' && state.mode !== 'fishing-contest') || state.phase !== 'idle') return this.message(id, 'Chờ lượt câu hiện tại kết thúc.');
    if (distance(player, FISHING_SPOT) > 2.4) return this.message(id, 'Đến bờ hồ để thả câu.');
    if (now < (state.nextCastAt ?? 0)) return this.message(id, 'Đợi một chút trước khi thả câu tiếp.');
    state.phase = 'waiting';
    state.readyAt = now + FISHING_RULES.minimumWaitMs + Math.floor(this.roll() * (FISHING_RULES.maximumWaitMs - FISHING_RULES.minimumWaitMs));
    state.biteUntil = state.readyAt + FISHING_RULES.biteWindowMs;
    state.message = 'Phao đã xuống nước. Chờ cá cắn câu…';
    this.effect(id, 'cast'); this.emit(id);
  }

  private reel(id: string, player: Participant, session: Session) {
    const state = session.state; const now = this.clock();
    if (state.mode !== 'fishing' && state.mode !== 'fishing-contest') return;
    if (state.phase !== 'waiting' && state.phase !== 'bite') return this.message(id, 'Thả câu trước khi giật cần.');
    if (distance(player, FISHING_SPOT) > 2.4 || now < (state.readyAt ?? Infinity) || now > (state.biteUntil ?? 0)) {
      this.resetCast(session, now, 'Giật cần sớm quá, cá đã bơi mất. Hãy thử lại.'); this.emit(id); return;
    }
    const fish = this.rollFish(); const score = fishScore(fish); const species = fishSpecies(fish.speciesId)!;
    this.resetCast(session, now, `${FISH_RARITIES[species.rarity].name} · ${species.name} · ${fish.size} cm!`);
    state.lastCatch = fish; state.score += score;
    if (state.mode === 'fishing-contest') {
      const entry = this.contest?.phase === 'running' ? this.contest.entries.get(id) : undefined;
      if (entry) { entry.score += score; entry.catches++; this.publishRoom(); }
    }
    // Catch receipts and contest-completion receipts are separate: a fish is never minted twice.
    this.award(id, 'fishing', score, Math.max(2, Math.round(score / 8)), 5 + Math.round(score / 20), fish);
    this.effect(id, 'catch', { fish }); this.emit(id);
  }

  private collect(id: string, player: Participant, session: Session, targetId?: string) {
    const state = session.state; const now = this.clock();
    if (state.mode !== 'lotus-hunt' || state.phase !== 'playing') return;
    const target = LOTUS_POINTS.find((point) => point.id === targetId);
    if (!target || distance(player, target) > 1.8) return this.message(id, 'Đến gần đóa sen để nhặt.');
    if (state.collected?.includes(target.id) || now - session.lastInputAt < 250) return;
    session.lastInputAt = now;
    state.collected = [...(state.collected ?? []), target.id]; state.score = state.collected.length * 10;
    state.message = `Đã tìm ${state.collected.length}/${LOTUS_POINTS.length} đóa sen.`;
    this.effect(id, 'lotus', { index: LOTUS_POINTS.indexOf(target) });
    if (state.collected.length === LOTUS_POINTS.length) {
      if (now - state.startedAt < 4000) return this.finish(id, 'Lượt tìm sen không hợp lệ. Hãy di chuyển theo các lối đi.');
      this.finish(id, 'Đã tìm đủ 10 đóa sen!');
      this.award(id, 'lotus-hunt', state.score, 40, 60);
    } else this.emit(id);
  }

  private checkpoint(id: string, player: Participant, session: Session, index?: number) {
    const state = session.state; const now = this.clock();
    if (state.mode !== 'race' || state.phase !== 'playing') return;
    const next = state.checkpoint ?? 0;
    if (!Number.isInteger(index) || index !== next || next >= RACE_CHECKPOINTS.length) return this.message(id, 'Đi qua từng cổng theo đúng thứ tự.');
    if (distance(player, RACE_CHECKPOINTS[next]) > 1.8 || now - session.lastInputAt < 250) return;
    const elapsed = now - state.startedAt;
    if (next === RACE_CHECKPOINTS.length - 1 && elapsed < 5000) return this.message(id, 'Hãy hoàn thành đường đua bằng cách di chuyển qua các cổng.');
    session.lastInputAt = now; state.checkpoint = next + 1;
    this.effect(id, 'checkpoint', { index: next });
    if (state.checkpoint === RACE_CHECKPOINTS.length) {
      state.score = elapsed;
      this.finish(id, `Về đích trong ${(elapsed / 1000).toFixed(2)} giây!`);
      this.award(id, 'race', elapsed, 40 + Math.max(0, Math.floor((90_000 - elapsed) / 5000)), 50);
    } else { state.message = `Cổng ${state.checkpoint}/${RACE_CHECKPOINTS.length} · Tiếp tục đến cổng sáng.`; this.emit(id); }
  }

  private note(id: string, player: Participant, session: Session, index?: number) {
    const state = session.state; const now = this.clock();
    if (state.mode !== 'memory' || state.phase !== 'playing' || !state.sequence) return;
    if (distance(player, activityDefinition('memory').location) > activityDefinition('memory').radius) return;
    if (!Number.isInteger(index) || index! < 0 || index! >= MEMORY_NOTES.length) return;
    if (now < (state.readyAt ?? Infinity)) return this.message(id, 'Nghe hết giai điệu trước khi nhắc lại nhé.');
    if (now - session.lastInputAt < 120) return;
    session.lastInputAt = now;
    if (index !== state.sequence[state.inputIndex ?? 0]) return this.finish(id, 'Chưa đúng giai điệu. Thử lại để luyện trí nhớ nhé.');
    state.inputIndex = (state.inputIndex ?? 0) + 1; state.score++;
    this.effect(id, 'note', { index });
    if (state.inputIndex === state.sequence.length) {
      if (state.sequence.length >= 7) {
        this.finish(id, 'Đã hoàn thành cả 5 vòng nhớ tiếng chuông!');
        this.award(id, 'memory', state.score, 35, 55);
        return;
      }
      state.sequence = [...state.sequence, this.rollNote()]; state.inputIndex = 0; state.round = (state.round ?? 1) + 1;
      state.readyAt = now + state.sequence.length * MEMORY_STEP_MS + 400;
      state.message = `Đúng rồi! Lắng nghe vòng ${state.round}.`;
    } else state.message = `Đúng ${state.inputIndex}/${state.sequence.length} nốt.`;
    this.emit(id);
  }

  private lantern(id: string, player: Participant, session: Session) {
    const state = session.state; const now = this.clock(); const challenge = this.lanterns;
    if (state.mode !== 'lanterns' || state.phase !== 'playing' || challenge?.phase !== 'running') return;
    if (distance(player, LANTERN_SPOT) > activityDefinition('lanterns').radius) return this.message(id, 'Đến bến thả đèn bên hồ.');
    if (now - session.lastLanternAt < 2000) return this.message(id, 'Đợi 2 giây để chiếc đèn trước trôi xa.');
    session.lastLanternAt = now;
    challenge.count++; const contribution = (challenge.contributions.get(id) ?? 0) + 1;
    challenge.contributions.set(id, contribution); state.score = contribution;
    state.message = `Bạn đã thả ${contribution} đèn · Cả phòng ${challenge.count}/${challenge.target}.`;
    this.effect(id, 'lantern', { index: challenge.count - 1 });
    if (challenge.count >= challenge.target) this.finishLanterns(true);
    else { this.emit(id); this.publishRoom(); }
  }

  private strike(id: string, player: Participant, session: Session) {
    const state = session.state; const now = this.clock();
    if (state.mode !== 'training' || state.phase !== 'playing') return;
    const definition = activityDefinition('training');
    if (distance(player, definition.location) > definition.radius || now - session.lastInputAt < 700) return;
    session.lastInputAt = now; state.score++;
    state.message = `${state.score} cú đấm chính xác · Tiếp tục giữ nhịp.`;
    this.effect(id, 'strike'); this.emit(id);
  }

  private finishContest(now: number) {
    const contest = this.contest;
    if (!contest || contest.phase !== 'running') return;
    contest.phase = 'finished';
    const entries = this.snapshot().contest!.leaderboard;
    entries.forEach((entry, index) => {
      const session = this.sessions.get(entry.playerId);
      if (!session || session.state.mode !== 'fishing-contest' || session.state.phase === 'finished') return;
      session.state.score = entry.score;
      this.finish(entry.playerId, `Hội câu kết thúc · Hạng ${index + 1} · ${entry.score} điểm / ${entry.catches} cá.`);
      if (entry.catches > 0) this.award(entry.playerId, 'fishing-contest', entry.score, index === 0 ? 60 : Math.min(40, 10 + entry.catches * 2), index === 0 ? 70 : 25);
    });
    contest.endsAt = now;
    this.publishRoom();
  }

  private finishLanterns(success: boolean) {
    const challenge = this.lanterns;
    if (!challenge || challenge.phase !== 'running') return;
    challenge.phase = 'finished'; challenge.endsAt = this.clock();
    for (const [id, count] of challenge.contributions) {
      const session = this.sessions.get(id);
      if (!session || session.state.mode !== 'lanterns' || session.state.phase === 'finished') continue;
      session.state.score = count;
      this.finish(id, success ? `Đêm hội hoàn thành! Cả phòng đã thả ${challenge.target} chiếc đèn.` : `Hết giờ · cả phòng đã thả ${challenge.count}/${challenge.target} đèn.`);
      if (success && count > 0) this.award(id, 'lanterns', count, 20 + count * 2, 25 + count * 3);
    }
    this.publishRoom();
  }

  private removeParticipation(id: string, state: ActivityState) {
    let changed = false;
    if (state.mode === 'fishing-contest' && this.contest?.phase === 'running') changed = this.contest.entries.delete(id) || changed;
    if (state.mode === 'lanterns' && this.lanterns?.phase === 'running') changed = this.lanterns.contributions.delete(id) || changed;
    if (changed) this.publishRoom();
  }

  private resetCast(session: Session, now: number, message: string) {
    const state = session.state;
    state.phase = 'idle'; state.readyAt = undefined; state.biteUntil = undefined;
    session.nextCastAt = now + FISHING_RULES.cooldownMs;
    state.nextCastAt = session.nextCastAt; state.message = message;
  }

  private finish(id: string, message: string) {
    const state = this.sessions.get(id)?.state;
    if (!state || state.phase === 'finished') return;
    state.phase = 'finished'; state.endsAt = this.clock(); state.readyAt = undefined; state.biteUntil = undefined;
    state.message = message; this.emit(id);
  }

  private message(id: string, message: string) { const state = this.sessions.get(id)?.state; if (state) { state.message = message; this.emit(id); } }
  private emit(id: string) { const state = this.sessions.get(id)?.state; if (state) this.hooks.sendState(id, copyState(state)); }
  private publishRoom() { this.hooks.broadcastRoom(this.snapshot()); }
  private effect(id: string, kind: ActivityEffect['kind'], extra: Partial<Pick<ActivityEffect, 'fish' | 'index'>> = {}) {
    const player = this.hooks.getPlayer(id); if (!player) return;
    this.hooks.broadcastEffect({ kind, playerId: id, x: player.x, z: player.z, at: this.clock(), ...extra });
  }
  private award(id: string, mode: ActivityMode, score: number, coins: number, xp: number, fish?: FishCatch) {
    this.hooks.reward(id, { id: crypto.randomUUID(), mode, score, coins, xp, ...(fish ? { fish: { ...fish } } : {}) });
  }
  private roll() { const value = this.random(); return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0.5; }
  private rollNote() { return Math.floor(this.roll() * MEMORY_NOTES.length); }
  private rollFish(): FishCatch {
    const rarities = Object.keys(FISH_RARITIES) as FishRarity[];
    let roll = this.roll() * rarities.reduce((sum, rarity) => sum + FISH_RARITIES[rarity].weight, 0);
    let selected = rarities.at(-1)!;
    for (const rarity of rarities) { roll -= FISH_RARITIES[rarity].weight; if (roll < 0) { selected = rarity; break; } }
    const species = FISH_SPECIES.filter((entry) => entry.rarity === selected);
    let speciesRoll = this.roll() * species.reduce((sum, entry) => sum + entry.weight, 0);
    let fish = species.at(-1)!;
    for (const entry of species) { speciesRoll -= entry.weight; if (speciesRoll < 0) { fish = entry; break; } }
    return { speciesId: fish.id, size: Math.round((fish.minSize + this.roll() * (fish.maxSize - fish.minSize)) * 10) / 10 };
  }
}
