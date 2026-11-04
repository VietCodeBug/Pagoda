import { Server, routePartykitRequest, type Connection } from 'partyserver';
import { TempleRoom } from './room';
import { createGameRoom, receiveGameMessage } from './game-transport';

type Env = { Temple: DurableObjectNamespace; ALLOWED_ORIGIN?: string; GAME_REWARD_SECRET?: string };

export class Temple extends Server<Env> {
  static options = { hibernate: false };
  private room?: TempleRoom;
  private timer?: ReturnType<typeof setInterval>;

  onStart() {
    this.room = createGameRoom(this.name,this.env.GAME_REWARD_SECRET);
  }
  onConnect(connection: Connection) {
    const accepted = this.room!.connect(connection.id, { send: (message) => connection.send(JSON.stringify(message)), close: (code, reason) => connection.close(code, reason) });
    if (accepted && !this.timer) this.timer = setInterval(() => {
      this.room?.tick();
      this.stopEmptyRoom();
    }, 100);
  }
  async onMessage(connection: Connection, message: string | ArrayBuffer) {
    if (typeof message === 'string') await receiveGameMessage(this.room!,connection.id,message,this.env.GAME_REWARD_SECRET);
    this.stopEmptyRoom();
  }
  private removeConnection(connection: Connection) {
    this.room?.disconnect(connection.id);
    this.stopEmptyRoom();
  }
  private stopEmptyRoom() {
    if (!this.room?.size && this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }
  onClose(connection: Connection) { this.removeConnection(connection); }
  onError(connection: Connection) { this.removeConnection(connection); }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true, capacity: 20 });
    return await routePartykitRequest(request, env, {
      onBeforeConnect(req) {
        const origin = req.headers.get('Origin');
        if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return new Response('Origin not allowed', { status: 403 });
        if (!/^\/parties\/temple\/[a-z0-9-]{1,40}$/.test(new URL(req.url).pathname)) return new Response('Room not found', { status: 404 });
      },
    }) || new Response('Virtual Temple realtime', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
