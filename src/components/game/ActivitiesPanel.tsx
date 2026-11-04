'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, BookOpen, ChevronDown, ChevronUp, Clock3, Coins, Fish, Flag, Flower2, Gamepad2, Medal, Music2, Send, Sparkles, Swords, Target, Trophy, Users, Waves, X } from 'lucide-react';
import { ACTIVITY_MODES, FISH_RARITIES, FISH_SPECIES, LOTUS_POINTS, MEMORY_NOTES, MEMORY_STEP_MS, RACE_CHECKPOINTS, type ActivityInput, type ActivityMode, type ActivityState, type RoomActivityState } from '@/lib/activities';
import { playAction, runtime, showToast, useGame } from '@/lib/game-store';
import { findPath, isInArena } from '@/lib/world-layout';

type ProgressView = {
  coins: number;
  xp: number;
  fish: { speciesId: string; amount: number; bestSize: number }[];
  scores: { mode: string; plays: number; bestScore: number; totalScore: number }[];
};
type ActivityViewState = ReturnType<typeof useGame.getState> & {
  activity: ActivityState | null;
  activityRoom: RoomActivityState | null;
  progress: ProgressView | null;
};
const useActivityState = <T,>(select: (state: ActivityViewState) => T) => useGame(state => select(state as ActivityViewState));
const icons = { fishing: Fish, 'fishing-contest': Trophy, 'lotus-hunt': Flower2, race: Flag, memory: Music2, lanterns: Sparkles, training: Target, duel: Swords };
const modeTags: Record<ActivityMode, string> = { fishing: 'THƯ GIÃN', 'fishing-contest': 'THI ĐẤU PHÒNG', 'lotus-hunt': 'KHÁM PHÁ', race: 'THỬ TỐC ĐỘ', memory: 'TRÍ NHỚ', lanterns: 'HỢP TÁC', training: 'LUYỆN TẬP', duel: 'PVP TỰ NGUYỆN' };
const modeHints: Record<ActivityMode, string> = {
  fishing: 'Thả cần bên hồ, chờ cá cắn rồi giật đúng lúc. Mỗi loài cá có độ hiếm và kích thước riêng.',
  'fishing-contest': 'Cùng câu trong một cuộc thi của phòng. Cá hiếm mang nhiều điểm hơn; theo dõi bảng xếp hạng trực tiếp.',
  'lotus-hunt': 'Tìm những đóa sen sáng trên bản đồ trước khi hết giờ. Đến gần và nhấn E để thu thập.',
  race: 'Đi qua các cổng theo đúng thứ tự. Chạy nhanh nhưng đừng bỏ qua checkpoint.',
  memory: 'Lắng nghe, ghi nhớ và lặp lại chuỗi tiếng chuông. Mỗi vòng chuỗi sẽ dài thêm.',
  lanterns: 'Cùng những người trong phòng thắp sáng bầu trời. Có thể bắt đầu một mình và cùng nhau hoàn thành.',
  training: 'Tới mộc nhân trong võ đài và luyện từng cú đấm. Giữ nhịp, hoàn thành lượt tập và lập kỷ lục.',
  duel: 'Hai người cùng bật giao đấu trong võ đài mới có thể gây sát thương. Hồi phục sau mỗi lượt.',
};
const sendActivity = (input: Omit<ActivityInput, 'type'>) => (runtime.send as (message: ActivityInput) => void)({ type: 'activity', ...input });
const scoreLabel = (mode: string, score: number) => mode === 'race' ? `${(score / 1000).toFixed(2)}s` : score.toLocaleString('vi-VN');

function focusGame() { requestAnimationFrame(() => document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })); }
function closePanel() { useGame.setState({ panel: 'none' }); focusGame(); }
function openPanel() { runtime.keys.clear(); runtime.joystick = { x: 0, y: 0 }; useGame.setState({ panel: 'activities' as ReturnType<typeof useGame.getState>['panel'] }); }

function startMode(mode: ActivityMode) {
  const state = useGame.getState();
  const reject = (message: string) => { showToast(message); return message; };
  if (state.status !== 'online') return reject('Đang kết nối phòng. Hoạt động sẽ sẵn sàng khi bạn online.');
  if (state.hp <= 0) return reject('Chờ nhân vật hồi phục rồi bắt đầu nhé.');
  if (state.action === 'sit') playAction('idle', 0);
  else if (Date.now() < state.actionUntil) return reject(state.action === 'fish' ? 'Thu cần hoặc rời câu cá trước khi đổi hoạt động.' : 'Hoàn tất động tác hiện tại rồi hãy bắt đầu hoạt động.');
  const definition = ACTIVITY_MODES.find(item => item.id === mode)!;
  const distance = Math.hypot(state.position.x - definition.location.x, state.position.z - definition.location.z);
  if (distance > definition.radius) {
    const path = findPath(state.position.x, state.position.z, definition.location.x, definition.location.z);
    if (path.length) { runtime.path = path; showToast(`Đang đến ${definition.name}. Tới nơi, nhấn E hoặc mở Hoạt động để bắt đầu.`); closePanel(); }
    else return reject(`Hãy đến vị trí ${definition.name} trên bản đồ để bắt đầu.`);
    return;
  }
  if (mode === 'duel') {
    if (!isInArena(state.position.x, state.position.z)) return reject('Đến võ đài để bật giao đấu.');
    runtime.send({ type: 'combat', enabled: !state.inCombat });
  } else {
    runtime.path = [];
    sendActivity({ action: 'start', mode });
  }
  closePanel();
}

function useNow(enabled = true) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

let noteContext: AudioContext | undefined;
function warmNotes() {
  if (useGame.getState().muted) return;
  noteContext ??= new AudioContext();
  void noteContext.resume().catch(() => {});
}
function soundNote(index: number) {
  if (useGame.getState().muted || !MEMORY_NOTES[index]) return;
  warmNotes();
  if (!noteContext || noteContext.state !== 'running') return;
  const oscillator = noteContext.createOscillator();
  const gain = noteContext.createGain();
  const now = noteContext.currentTime;
  oscillator.type = 'sine';
  oscillator.frequency.value = MEMORY_NOTES[index].frequency;
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.13, now + .025);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .5);
  oscillator.connect(gain); gain.connect(noteContext.destination);
  oscillator.start(now); oscillator.stop(now + .55);
}

function FishArt({ rarity, size = 48 }: { rarity: keyof typeof FISH_RARITIES; size?: number }) {
  const color = FISH_RARITIES[rarity].color;
  return <svg className="collection-fish-art" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M12 32c9-14 27-16 40 0-13 16-31 14-40 0Z" fill={color} fillOpacity=".72"/><path d="m14 32-9-10v20l9-10Zm14-9 7-8 7 10m-14 16 7 8 7-10" fill={color} fillOpacity=".5"/><path d="M26 24c-3 5-3 11 0 16" stroke="#193b33" strokeOpacity=".45" strokeWidth="2"/><circle cx="43" cy="29" r="2.3" fill="#132e27"/><path d="M53 31h4" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>;
}

export default function ActivitiesPanel() {
  const progress = useActivityState(state => state.progress);
  const activity = useActivityState(state => state.activity);
  const status = useGame(state => state.status);
  const position = useGame(state => state.position);
  const rewardSaving = useGame(state => state.rewardSaving);
  const [tab, setTab] = useState<'modes' | 'collection' | 'records'>('modes');
  const [rarity, setRarity] = useState<string>('all');
  const [notice, setNotice] = useState('');
  const discovered = FISH_SPECIES.filter(fish => progress?.fish.some(catchItem => catchItem.speciesId === fish.id && catchItem.amount > 0)).length;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.code === 'Escape') closePanel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return <div className="activities-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closePanel(); }}>
    <section className="activities-dialog" role="dialog" aria-modal="true" aria-label="Hoạt động và bộ sưu tập">
      <button className="activities-close" aria-label="Đóng hoạt động" onClick={closePanel}><X size={20}/></button>
      <header className="activities-heading"><div><span className="activities-eyebrow"><Sparkles size={13}/> MỘT THẾ GIỚI ĐỂ KHÁM PHÁ</span><h2>Hôm nay, bạn muốn chơi gì?</h2><p>Rủ một người bạn. Hoặc bắt đầu hành trình riêng của mình.</p></div><div className="activities-wallet"><span><Coins size={15}/><b>{progress ? progress.coins.toLocaleString('vi-VN') : '—'}</b> xu</span><span><Medal size={15}/><b>{progress ? progress.xp.toLocaleString('vi-VN') : '—'}</b> XP</span></div></header>
      <nav className="activities-tabs" aria-label="Mục hoạt động"><button className={tab === 'modes' ? 'active' : ''} onClick={() => setTab('modes')}><Gamepad2 size={15}/> Hoạt động <small>8</small></button><button className={tab === 'collection' ? 'active' : ''} onClick={() => setTab('collection')}><Fish size={15}/> Sổ cá <small>{discovered}/{FISH_SPECIES.length}</small></button><button className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}><Trophy size={15}/> Thành tích</button></nav>
      <div className="activities-scroll">
        {notice && <p className="activities-save-note" role="alert" style={{ textAlign: 'left', color: '#e6bd8e', margin: '0 0 16px' }}>{notice}</p>}
        {rewardSaving && <p className="activities-save-note" role="status" style={{ margin: '0 0 12px' }}>Đang lưu kết quả hoạt động…</p>}
        {tab === 'modes' && <><div className="activities-section-intro"><span>CHỌN MỘT TRẢI NGHIỆM</span><small><Users size={12}/>{status === 'online' ? 'Đang kết nối phòng chung' : 'Cần kết nối phòng online để bắt đầu'}</small></div><div className="activity-card-grid">{ACTIVITY_MODES.map(mode => {
          const Icon = icons[mode.id];
          const near = Math.hypot(position.x - mode.location.x, position.z - mode.location.z) <= mode.radius;
          return <article key={mode.id} className={`activity-mode-card mode-${mode.id} ${activity?.mode === mode.id && activity.phase !== 'finished' ? 'is-current' : ''}`} data-activity-mode={mode.id}><div className="activity-mode-top"><span className="activity-mode-icon"><Icon size={23}/></span><span className="activity-mode-tag">{modeTags[mode.id]}</span></div><h3>{mode.name}</h3><p>{modeHints[mode.id]}</p><footer><span><Clock3 size={12}/>{mode.durationMs ? `${Math.round(mode.durationMs / 1000)} giây` : 'Theo nhịp của bạn'}</span><button type="button" disabled={status !== 'online'} aria-label={`${near ? 'Bắt đầu' : 'Chỉ đường tới'} ${mode.name}`} onClick={() => { warmNotes(); setNotice(startMode(mode.id) || ''); }}>{near ? 'Bắt đầu' : 'Chỉ đường'}<ArrowRight size={14}/></button></footer></article>;
        })}</div></>}
        {tab === 'collection' && <><div className="fish-collection-intro"><span className="collection-title-mark"><BookOpen size={29}/></span><div><h3>Những cư dân của hồ An Nhiên</h3><p>Mỗi lần câu là một cơ hội tìm thấy điều mới. Cá hiếm không xuất hiện thường xuyên.</p></div><strong>{discovered}<small>/{FISH_SPECIES.length} loài</small></strong></div><div className="rarity-filters" role="group" aria-label="Lọc độ hiếm"><button className={rarity === 'all' ? 'selected' : ''} onClick={() => setRarity('all')}>Tất cả</button>{Object.entries(FISH_RARITIES).map(([key, item]) => <button key={key} style={{ '--rarity': item.color } as CSSProperties} className={rarity === key ? 'selected' : ''} onClick={() => setRarity(key)}><i/>{item.name}</button>)}</div><div className="fish-collection-grid">{FISH_SPECIES.filter(fish => rarity === 'all' || fish.rarity === rarity).map(fish => {
          const owned = progress?.fish.find(item => item.speciesId === fish.id);
          const known = Boolean(owned?.amount);
          const tier = FISH_RARITIES[fish.rarity];
          return <article className={`fish-collection-card ${known ? 'discovered' : 'undiscovered'}`} key={fish.id} style={{ '--rarity': tier.color } as CSSProperties}><div className="fish-art-space"><FishArt rarity={fish.rarity} size={65}/>{!known && <span>?</span>}</div><span className="fish-rarity"><i/>{tier.name}</span><h4>{fish.name}</h4><p>{known ? `${owned!.amount} con đã bắt` : 'Chưa khám phá'}</p><footer><span>Kỷ lục</span><b>{known ? `${owned!.bestSize.toFixed(1)} cm` : '—'}</b></footer></article>;
        })}</div>{!progress && <p className="activities-save-note">Bộ sưu tập sẽ xuất hiện khi hồ sơ được đồng bộ.</p>}</>}
        {tab === 'records' && <><div className="activities-section-intro"><span>DẤU CHÂN CỦA BẠN</span><small>Thành tích đã lưu của hồ sơ khách</small></div><div className="activity-records">{ACTIVITY_MODES.filter(mode => mode.id !== 'duel').map(mode => {
          const score = progress?.scores.find(item => item.mode === mode.id);
          const Icon = icons[mode.id];
          return <article key={mode.id}><span className="record-icon"><Icon size={21}/></span><div><h3>{mode.name}</h3><p>{score ? `${score.plays} lượt hoàn thành${mode.id === 'race' ? '' : ` · Tổng ${score.totalScore.toLocaleString('vi-VN')} điểm`}` : 'Hành trình còn đang chờ bạn'}</p></div><strong>{score ? scoreLabel(mode.id, score.bestScore) : '—'}<small>{mode.id === 'race' ? 'nhanh nhất' : 'kỷ lục'}</small></strong></article>;
        })}</div><p className="activities-save-note">Xu, cá và thành tích đến từ kết quả được máy chủ xác nhận. Hoạt động không cộng điểm công đức.</p></>}
      </div>
      <footer className="activities-dialog-footer"><span><Waves size={14}/> Không cần vội. Mọi hành trình đều bắt đầu từ một bước chân.</span><button onClick={closePanel}>Trở về sân chùa <ArrowRight size={14}/></button></footer>
    </section>
  </div>;
}

export function ActivityOverlay() {
  const entered = useGame(state => state.entered);
  const panel = useGame(state => state.panel);
  const status = useGame(state => state.status);
  const localId = useGame(state => state.localId);
  const position = useGame(state => state.position);
  const hp = useGame(state => state.hp);
  const rewardSaving = useGame(state => state.rewardSaving);
  const activity = useActivityState(state => state.activity);
  const room = useActivityState(state => state.activityRoom);
  const [collapsed, setCollapsed] = useState(false);
  const now = useNow(Boolean(entered && activity?.mode && panel === 'none'));
  const lastPlayed = useRef('');
  const mode = ACTIVITY_MODES.find(item => item.id === activity?.mode);
  const sequence = activity?.sequence || [];
  const sequenceKey = `${activity?.readyAt}:${sequence.join(',')}`;
  const revealing = Boolean(entered && panel === 'none' && activity?.mode === 'memory' && activity.phase === 'playing' && activity.readyAt && now < activity.readyAt);
  const revealingIndex = revealing && activity?.readyAt ? Math.floor((now - (activity.readyAt - sequence.length * MEMORY_STEP_MS)) / MEMORY_STEP_MS) : -1;
  useEffect(() => {
    if (!revealing || revealingIndex < 0 || revealingIndex >= sequence.length) return;
    const key = `${sequenceKey}:${revealingIndex}`;
    if (lastPlayed.current === key) return;
    lastPlayed.current = key;
    soundNote(sequence[revealingIndex]);
  }, [revealing, revealingIndex, sequenceKey, sequence]);
  useEffect(() => { setCollapsed(false); }, [activity?.mode]);
  useEffect(() => {
    if (!entered || panel !== 'none' || status !== 'online' || hp <= 0 || activity?.mode !== 'memory' || activity.phase !== 'playing') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || useGame.getState().chatOpen || (event.target as HTMLElement)?.matches('input,textarea,select')) return;
      const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
      if (index < 0 || Date.now() < (activity.readyAt || 0)) return;
      event.preventDefault(); soundNote(index); sendActivity({ action: 'note', index });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [entered, panel, status, hp, activity]);
  if (!entered || panel !== 'none') return null;
  const online = status === 'online' && hp > 0;
  const active = Boolean(activity?.mode && mode);
  const remaining = activity?.endsAt && now ? Math.max(0, Math.ceil((activity.endsAt - now) / 1000)) : 0;
  const finished = activity?.phase === 'finished';
  const displayedScore = activity?.mode === 'race' && activity.phase === 'playing' ? Math.max(0, now - activity.startedAt) : activity?.score || 0;
  const Icon = mode ? icons[mode.id] : Gamepad2;
  const primary = (action: Omit<ActivityInput, 'type'>) => { if (online) sendActivity(action); };
  const nearLotus = LOTUS_POINTS.filter(point => !activity?.collected?.includes(point.id)).find(point => Math.hypot(position.x - point.x, position.z - point.z) <= 1.8);
  const checkpoint = RACE_CHECKPOINTS[activity?.checkpoint || 0];
  const nearCheckpoint = checkpoint && Math.hypot(position.x - checkpoint.x, position.z - checkpoint.z) <= 2;
  const contest = room?.contest;
  const lanterns = room?.lanterns;
  return <>
    <button className="activity-launcher" aria-label="Mở hoạt động và bộ sưu tập" onClick={openPanel}><Gamepad2 size={17}/><span>Hoạt động</span><small>8</small></button>
    {active && activity && <section className={`activity-live-panel ${collapsed ? 'is-collapsed' : ''} ${finished ? 'is-finished' : ''}`} aria-label={`Đang chơi ${mode!.name}`}>
      <header><span className="activity-live-icon"><Icon size={18}/></span><div><small>{finished ? 'HOÀN THÀNH LƯỢT CHƠI' : 'ĐANG THAM GIA'}</small><strong>{mode!.name}</strong></div><button className="activity-live-collapse" aria-label={collapsed ? 'Mở hoạt động đang chơi' : 'Thu gọn hoạt động'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronDown size={17}/> : <ChevronUp size={17}/>}</button></header>
      {!collapsed && <div className="activity-live-content"><div className="activity-live-stats"><span><Trophy size={13}/><b>{activity.mode === 'race' ? (displayedScore / 1000).toFixed(2) : scoreLabel(activity.mode!, displayedScore)}</b>{activity.mode === 'race' ? ' giây' : ' điểm'}</span>{activity.endsAt > 0 && <span><Clock3 size={13}/>{remaining}s</span>}<button onClick={() => { primary({ action: 'leave' }); }} aria-label="Rời hoạt động"><X size={13}/></button></div><p className="activity-live-message" role="status">{activity.message}</p>
        {(activity.mode === 'fishing' || activity.mode === 'fishing-contest') && <>
          {activity.phase === 'waiting' && <div className="fishing-wait"><span className="fishing-bobber"/><span>Đang đợi cá…<small>Giữ bình tĩnh, nhìn phao nhé</small></span><Waves size={26}/></div>}
          {activity.phase === 'bite' && <button className="activity-main-action fish-bite-action" disabled={!online} onClick={() => primary({ action: 'reel' })}><Fish size={20}/> Cá cắn câu! Giật cần <kbd>E</kbd></button>}
          {activity.phase !== 'waiting' && activity.phase !== 'bite' && !finished && <button className="activity-main-action" disabled={!online || (activity.nextCastAt || 0) > now} onClick={() => primary({ action: 'cast' })}><Fish size={18}/>{(activity.nextCastAt || 0) > now ? 'Đang chuẩn bị cần…' : 'Thả câu'}<kbd>E</kbd></button>}
          {activity.lastCatch && (() => { const fish = FISH_SPECIES.find(item => item.id === activity.lastCatch!.speciesId); if (!fish) return null; const tier = FISH_RARITIES[fish.rarity]; return <div className="activity-catch-result" style={{ '--rarity': tier.color } as CSSProperties}><FishArt rarity={fish.rarity} size={47}/><span><small>{tier.name}</small><strong>{fish.name}</strong><b>{activity.lastCatch.size.toFixed(1)} cm</b></span><Sparkles size={17}/></div>; })()}
        </>}
        {activity.mode === 'lotus-hunt' && <><div className="activity-progress"><span>Đã tìm {activity.collected?.length || 0}/{LOTUS_POINTS.length} đóa sen</span><i><b style={{ width: `${(activity.collected?.length || 0) / LOTUS_POINTS.length * 100}%` }}/></i></div><button className="activity-main-action" disabled={!online || !nearLotus || finished} onClick={() => nearLotus && primary({ action: 'collect', targetId: nearLotus.id })}><Flower2 size={18}/>{nearLotus ? 'Nhặt sen' : 'Tìm đóa sen sáng tiếp theo'}{nearLotus && <kbd>E</kbd>}</button></>}
        {activity.mode === 'race' && <><div className="activity-progress"><span>Checkpoint {Math.min((activity.checkpoint || 0) + 1, RACE_CHECKPOINTS.length)}/{RACE_CHECKPOINTS.length}</span><i><b style={{ width: `${(activity.checkpoint || 0) / RACE_CHECKPOINTS.length * 100}%` }}/></i></div><button className="activity-main-action" disabled={!online || !nearCheckpoint || finished} onClick={() => primary({ action: 'checkpoint', index: activity.checkpoint || 0 })}><Flag size={18}/>{nearCheckpoint ? 'Qua checkpoint' : 'Chạy đến cổng sáng'}{nearCheckpoint && <kbd>E</kbd>}</button></>}
        {activity.mode === 'memory' && <><div className="memory-instruction"><span>Vòng {activity.round || 1}</span><strong>{revealing ? 'Lắng nghe chuỗi chuông' : finished ? 'Lượt chơi đã kết thúc' : `Đến lượt bạn · ${(activity.inputIndex || 0) + 1}/${sequence.length}`}</strong></div><div className="memory-notes">{MEMORY_NOTES.map((note, index) => <button key={index} style={{ '--note-color': note.color } as CSSProperties} aria-label={`Chuông ${note.name}`} className={revealing && sequence[revealingIndex] === index ? 'is-playing' : ''} disabled={!online || revealing || finished} onClick={() => { soundNote(index); primary({ action: 'note', index }); }}><Music2 size={20}/><span>{note.name}</span><kbd>{index + 1}</kbd></button>)}</div></>}
        {activity.mode === 'lanterns' && <><div className="activity-progress"><span>{lanterns?.count || 0}/{lanterns?.target || 12} đèn · {lanterns?.participants || 1} người góp sức</span><i><b style={{ width: `${Math.min(100, (lanterns?.count || 0) / (lanterns?.target || 12) * 100)}%` }}/></i></div><button className="activity-main-action" disabled={!online || finished} onClick={() => primary({ action: 'lantern' })}><Send size={18}/> Thả một chiếc đèn <kbd>E</kbd></button></>}
        {activity.mode === 'training' && <button className="activity-main-action" disabled={!online || finished} onClick={() => primary({ action: 'strike' })}><Swords size={18}/> Đấm mộc nhân <kbd>E</kbd></button>}
        {finished && <button className="activity-main-action" disabled={!online} onClick={() => startMode(activity.mode!)}><ArrowRight size={17}/> Chơi một lượt nữa</button>}
        {activity.mode === 'fishing-contest' && contest && <div className="activity-leaderboard"><h4><Trophy size={13}/> Bảng câu cá · {contest.phase === 'running' ? `${Math.max(0, Math.ceil((contest.endsAt - now) / 1000))}s` : 'Đã kết thúc'}</h4>{contest.leaderboard.length ? contest.leaderboard.slice(0, 5).map((player, index) => <p key={player.playerId} className={player.playerId === localId ? 'is-you' : ''}><span>{index + 1}</span><b>{player.name}{player.playerId === localId ? ' · bạn' : ''}</b><small>{player.catches} cá</small><strong>{player.score}</strong></p>) : <p className="leaderboard-empty">Chờ những lần cắn câu đầu tiên…</p>}</div>}
        {!online && <p className="activity-connection-note">Đang nối lại phòng. Kết quả sẽ do máy chủ xác nhận.</p>}
        {rewardSaving && <p className="activity-connection-note" role="status">Đang lưu kết quả…</p>}
      </div>}
    </section>}
  </>;
}
