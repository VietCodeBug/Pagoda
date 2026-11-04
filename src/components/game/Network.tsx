'use client';
import { useEffect } from 'react';
import type { ServerMessage, ClientMessage } from '@/lib/protocol';
import type { PublicRealtimeConfig } from '@/lib/realtime-config';
import { runtime, useGame, showToast } from '@/lib/game-store';
import { ringBell } from '@/lib/audio';

export default function Network() {
  const entered = useGame(s => s.entered);
  const room = useGame(s => s.room);
  useEffect(() => {
    if (!entered) return;
    let disposed = false;
    let generation = 0;
    let attempts = 0;
    let socket: WebSocket | null = null;
    let request: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let welcomeTimeout: ReturnType<typeof setTimeout> | undefined;
    const clearPlayers = () => useGame.setState({ localId: '', players: [], bubbles: {}, inCombat: false });
    const stopSocket = () => {
      clearTimeout(welcomeTimeout);
      runtime.send = () => {};
      const previous = socket;
      socket = null;
      previous?.close();
    };
    const schedule = (delay: number) => {
      clearTimeout(retry);
      if (!disposed) retry = setTimeout(() => { void connect(); }, delay);
    };

    async function connect() {
      if (disposed) return;
      const version = ++generation;
      const active = () => !disposed && version === generation;
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
        const connection = new WebSocket(`${config.url.replace(/\/$/, '')}/parties/temple/${room}`);
        socket = connection;
        runtime.send = (message: ClientMessage) => {
          if (active() && socket === connection && connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify(message));
        };
        welcomeTimeout = setTimeout(() => { if (active()) connection.close(); }, 15_000);
        connection.onopen = () => {
          if (!active()) return;
          const state = useGame.getState();
          runtime.send({ type: 'join', name: state.name, avatar: state.avatar });
        };
        connection.onmessage = event => {
          if (!active()) return;
          let data: ServerMessage;
          try { data = JSON.parse(event.data); } catch { return; }
          const current = useGame.getState();
          if (data.type === 'welcome') {
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
          if (event.code === 4001 || event.code === 4003 || event.reason.toLowerCase().includes('full')) {
            useGame.setState({ status: 'offline', connectionIssue: 'full' });
            showToast('Phòng đã đầy. Hãy chọn phòng khác trong cài đặt.');
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
      attempts = 0;
      useGame.setState({ status: 'connecting', connectionIssue: '' });
      void connect();
    };
    runtime.reconnect = reconnect;
    void connect();
    const heartbeat = setInterval(() => runtime.send({ type: 'ping' }), 20_000);
    return () => {
      disposed = true;
      generation++;
      clearTimeout(retry);
      clearInterval(heartbeat);
      request?.abort();
      stopSocket();
      clearPlayers();
      if (runtime.reconnect === reconnect) runtime.reconnect = () => {};
    };
  }, [entered, room]);
  return null;
}
