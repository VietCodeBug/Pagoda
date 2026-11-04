import { Server, routePartykitRequest, type Connection } from 'partyserver';
import { TempleRoom } from './room';

type Env = { Temple: DurableObjectNamespace; ALLOWED_ORIGIN?: string };

export class Temple extends Server<Env> {
  static options = { hibernate: false };
  private room?: TempleRoom;
  private timer?: ReturnType<typeof setInterval>;

  onStart() {
    this.room = new TempleRoom(this.name);
  }
  onConnect(connection: Connection) {
    const accepted = this.room!.connect(connection.id, { send: (message) => connection.send(JSON.stringify(message)), close: (code, reason) => connection.close(code, reason) });
    if (accepted && !this.timer) this.timer = setInterval(() => this.room?.tick(), 100);
  }
  onMessage(connection: Connection, message: string | ArrayBuffer) { if (typeof message === 'string') this.room!.receive(connection.id, message); }
  private removeConnection(connection: Connection) {
    this.room?.disconnect(connection.id);
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
