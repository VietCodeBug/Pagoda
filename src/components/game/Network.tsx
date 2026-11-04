'use client';
import { useEffect } from 'react';
import { PRESENCE_HEARTBEAT_MS, type ServerMessage, type ClientMessage } from '@/lib/protocol';
import type { PublicRealtimeConfig } from '@/lib/realtime-config';
import { runtime, useGame, showToast } from '@/lib/game-store';
import { ringBell } from '@/lib/audio';
import { fishSpecies } from '@/lib/activities';
import type { GameProgress } from '@/lib/game-progress';
import { getTabSession } from '@/lib/tab-session';

const rewardsInFlight=new Set<string>();
async function refreshGameProgress(){
  try{const response=await fetch('/api/game/progress',{cache:'no-store'});if(response.ok)useGame.setState({progress:await response.json() as GameProgress});}catch{/* Retain the last saved snapshot. */}
}
async function saveGameReward(id:string,receipt:string,label:string){
  if(rewardsInFlight.has(id))return;
  rewardsInFlight.add(id);useGame.setState({rewardSaving:true});
  try{
    for(let attempt=0;attempt<3;attempt++){
      try{
        const response=await fetch('/api/game/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt})});
        if(response.ok){const result=await response.json();useGame.setState({progress:result.progress});if(result.applied)showToast(label);return;}
        if(response.status<500&&response.status!==429){showToast('Chưa lưu được phần thưởng. Hãy tải lại để kết nối đúng hồ sơ.');return;}
      }catch{/* Retry the same signed, idempotent receipt. */}
      await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
    }
    showToast('Kết nối lưu thành tích đang gián đoạn. Hãy giữ trang mở rồi thử lại.');
  }finally{rewardsInFlight.delete(id);useGame.setState({rewardSaving:rewardsInFlight.size>0});}
}

export default function Network() {
  const entered = useGame(s => s.entered);
  const room = useGame(s => s.room);
  useEffect(() => {
    if (!entered) return;
    let disposed = false;
    let suspended = false;
    let replaced = false;
    let generation = 0;
    let attempts = 0;
    let socket: WebSocket | null = null;
    let request: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let welcomeTimeout: ReturnType<typeof setTimeout> | undefined;
    let lastMessageAt = 0;
    const tabSession = getTabSession();
    const clearPlayers = () => {const current=useGame.getState();useGame.setState({ localId: '', players: [], bubbles: {}, inCombat: false,activity:null,activityRoom:null,activityEffects:[],...(current.action==='fish'?{action:'idle',actionUntil:0}:{}) });};
    const stopSocket = (reason = 'Client reconnecting') => {
      clearTimeout(welcomeTimeout);
      runtime.send = () => {};
      const previous = socket;
      socket = null;
      if (previous) {
        // pagehide runs for navigation, closing a tab and entering the back/forward cache.
        // Send a room-level leave before the transport starts its closing handshake.
        try { if (previous.readyState === WebSocket.OPEN) previous.send(JSON.stringify({ type: 'leave' } satisfies ClientMessage)); } catch { /* The server lease handles a dead transport. */ }
        try { previous.close(1000, reason); } catch { /* Already closed. */ }
      }
    };
    const schedule = (delay: number) => {
      clearTimeout(retry);
      if (!disposed && !suspended && !replaced) retry = setTimeout(() => { void connect(); }, delay);
    };

    async function connect() {
      if (disposed || suspended || replaced) return;
      const version = ++generation;
      const active = () => !disposed && !suspended && version === generation;
      clearTimeout(retry);
      request?.abort();
      stopSocket();
      clearPlayers();
      const previousIssue = useGame.getState().connectionIssue;
      if (previousIssue !== 'missing' && previousIssue !== 'invalid') {
        useGame.setState({ status: attempts ? 'reconnecting' : 'connecting', connectionIssue: '' });
      }
      request = new AbortController();
      const currentRequest = request;
      const fetchTimeout = setTimeout(() => currentRequest.abort(), 8000);
      try {
        const response = await fetch('/api/realtime/config', { cache: 'no-store', signal: currentRequest.signal });
        if (!response.ok) throw new Error('Room configuration unavailable');
        const config = await response.json() as PublicRealtimeConfig;
        if (!active()) return;
        if (!config.configured || typeof config.url !== 'string') {
          useGame.setState({ status: 'offline', connectionIssue: config.reason === 'invalid' ? 'invalid' : 'missing' });
          // A newly configured Worker is picked up without leaving or reloading the game.
          schedule(15_000);
          return;
        }
        useGame.setState({ status: attempts ? 'reconnecting' : 'connecting', connectionIssue: '' });
        let ticket:string|undefined;
        try{
          const sessionResponse=await fetch('/api/game/session',{cache:'no-store',signal:currentRequest.signal});
          if(sessionResponse.ok){const session=await sessionResponse.json();ticket=session.ticket;if(active())useGame.setState({progress:session.progress});}
        }catch{/* Room movement/chat remain available if progress is temporarily unavailable. */}
        if(!active())return;
        const clientId = await tabSession.acquire();
        if(!active())return;
        const connection = new WebSocket(`${config.url.replace(/\/$/, '')}/parties/temple/${room}`);
        socket = connection;
        lastMessageAt = Date.now();
        runtime.send = (message: ClientMessage) => {
          if (active() && socket === connection && connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify(message));
        };
        welcomeTimeout = setTimeout(() => { if (active()) connection.close(); }, 15_000);
        connection.onopen = () => {
          if (!active()) return;
          const state = useGame.getState();
          runtime.send({ type: 'join', name: state.name, avatar: state.avatar, clientId,...(ticket?{ticket}:{}) });
        };
        connection.onmessage = event => {
          if (!active()) return;
          let data: ServerMessage;
          try { data = JSON.parse(event.data); } catch { return; }
          lastMessageAt = Date.now();
          const current = useGame.getState();
          if (data.type === 'heartbeat') {
            runtime.send({ type: 'ping' });
          } else if (data.type === 'welcome') {
            if (data.roomId !== room) return;
            clearTimeout(welcomeTimeout);
            attempts = 0;
            const me = data.players.find(p => p.id === data.id);
            runtime.teleport = { x: me?.x ?? 0, z: me?.z ?? 16 };
            useGame.setState({ localId: data.id, players: data.players, status: 'online', connectionIssue: '', hp: me?.hp ?? 100, inCombat: false });
          } else if (data.type === 'state') {
            const me = data.players.find(p => p.id === current.localId);
            const patch: { players: typeof data.players; hp?: number; inCombat?: boolean; respawnAt?: number } = { players: data.players };
            if (me) {
              patch.hp = me.hp; patch.inCombat = me.inCombat; patch.respawnAt = me.respawnAt ?? 0;
              if (Math.hypot(me.x - current.position.x, me.z - current.position.z) > 2.5) runtime.teleport = { x: me.x, z: me.z };
            }
            useGame.setState(patch);
          } else if(data.type==='activity_state'){
            const fishing=(data.state.mode==='fishing'||data.state.mode==='fishing-contest')&&(data.state.phase==='waiting'||data.state.phase==='bite');
            useGame.setState({activity:data.state,...(fishing?{action:'fish',actionUntil:Infinity}:current.action==='fish'?{action:'idle',actionUntil:0}:{})});
          } else if(data.type==='activity_room')useGame.setState({activityRoom:data.room});
          else if(data.type==='activity_effect'){
            useGame.setState({activityEffects:[...current.activityEffects.filter(effect=>Date.now()-effect.at<20_000),data.effect].slice(-48)});
            if(data.effect.kind==='strike'&&data.effect.playerId===current.localId){runtime.path=[];useGame.setState({action:'attack',actionUntil:Date.now()+720});}
          } else if(data.type==='activity_reward'){
            const fish=data.reward.fish?fishSpecies(data.reward.fish.speciesId):undefined;
            if(data.receipt)void saveGameReward(data.reward.id,data.receipt,`${fish?`Đã lưu ${fish.name}`:'Đã lưu thành tích'} · +${data.reward.coins} xu`);
            else showToast('Đã hoàn thành lượt chơi nhưng chưa kết nối được sổ thành tích. Hãy tải lại game.');
          } else if (data.type === 'chat') {
            useGame.setState({ messages: [...current.messages, data].slice(-60), bubbles: { ...current.bubbles, [data.playerId]: { text: data.text, until: Date.now() + 7000 } } });
          } else if (data.type === 'error') showToast(data.message);
          else if (data.type === 'event') {
            if (data.event === 'incense') useGame.setState({ incenseUntil: Date.now() + 22000 });
            if (data.event === 'bell') {
              useGame.setState({ bellAt: Date.now() });
              ringBell(Math.hypot(current.position.x - 10, current.position.z + 5));
            }
            if (data.event === 'emote') useGame.setState({ bubbles: { ...current.bubbles, [data.playerId]: { text: data.emoji ?? '🙏', until: Date.now() + 4500 } } });
            if (data.event === 'respawn' && data.playerId === current.localId) {
              runtime.teleport = { x: 0, z: 16 }; showToast('Đã hồi phục tại sân chùa. Bạn có thể quay lại luyện tập.');
            }
          }
        };
        connection.onclose = event => {
          if (!active()) return;
          clearTimeout(welcomeTimeout);
          runtime.send = () => {};
          socket = null;
          clearPlayers();
          if (event.code === 4005) {
            replaced = true;
            clearTimeout(retry);
            useGame.setState({ status: 'offline', connectionIssue: 'replaced' });
            showToast('Phiên chơi đã được mở lại. Bấm kết nối lại nếu bạn muốn tiếp tục ở tab này.');
            return;
          }
          if (event.code === 4001 || event.code === 4003 || event.reason.toLowerCase().includes('full')) {
            useGame.setState({ status: 'offline', connectionIssue: 'full' });
            showToast('Phòng đã đầy. Chọn phòng khác hoặc đợi game tự thử lại.');
            schedule(15_000);
            return;
          }
          useGame.setState({ status: 'reconnecting', connectionIssue: 'unreachable' });
          attempts++;
          schedule(Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4)));
        };
        connection.onerror = () => { /* onclose or the welcome timeout schedules recovery. */ };
      } catch {
        if (!active()) return;
        attempts++;
        useGame.setState({ status: 'reconnecting', connectionIssue: 'unreachable' });
        schedule(Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4)));
      } finally { clearTimeout(fetchTimeout); }
    }

    const reconnect = () => {
      if (disposed || suspended) return;
      replaced = false;
      attempts = 0;
      useGame.setState({ status: 'connecting', connectionIssue: '' });
      void connect();
    };
    runtime.reconnect = reconnect;
    runtime.refreshProgress=()=>{void refreshGameProgress();};
    const heartbeat = () => {
      if (disposed || suspended || replaced) return;
      if (socket?.readyState === WebSocket.OPEN) {
        // Recover a half-open socket as soon as a suspended browser can run again.
        if (Date.now() - lastMessageAt > 45_000) { void connect(); return; }
        runtime.send({ type: 'ping' });
      }
    };
    const pagehide = () => {
      suspended = true;
      generation++;
      clearTimeout(retry);
      request?.abort();
      stopSocket('Page hidden');
      tabSession.release();
      clearPlayers();
    };
    const pageshow = () => {
      if (!suspended || disposed) return;
      suspended = false;
      if (!replaced) { attempts = 0; void connect(); }
    };
    const visible = () => {
      // Background tabs still belong to the room. Only pagehide means leaving it.
      if (document.visibilityState === 'visible') heartbeat();
    };
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', pageshow);
    document.addEventListener('visibilitychange', visible);
    void connect();
    const heartbeatTimer = setInterval(heartbeat, PRESENCE_HEARTBEAT_MS);
    return () => {
      disposed = true;
      generation++;
      clearTimeout(retry);
      clearInterval(heartbeatTimer);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
      document.removeEventListener('visibilitychange', visible);
      request?.abort();
      stopSocket('Left room');
      tabSession.release();
      clearPlayers();
      if (runtime.reconnect === reconnect) runtime.reconnect = () => {};
    };
  }, [entered, room]);
  return null;
}
