import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { TempleRoom } from '../server/room';

const port = Number(process.env.REALTIME_PORT || 1999);
const rooms = new Map<string, TempleRoom>();
const http = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ service: 'virtual-temple-realtime', rooms: Array.from(rooms, ([id, room]) => ({ id, players: room.size })) })); });
const sockets = new WebSocketServer({ server: http, maxPayload: 2048 });
sockets.on('connection', (socket, request) => {
  const match = /^\/parties\/temple\/([a-z0-9-]{1,40})$/.exec(new URL(request.url || '/', 'http://localhost').pathname);
  if (!match) return socket.close(4004, 'Unknown room route');
  const roomId = match[1];
  const room = rooms.get(roomId) ?? new TempleRoom(roomId);
  rooms.set(roomId, room);
  const id = crypto.randomUUID();
  if (!room.connect(id, { send: (message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }, close: (code, reason) => socket.close(code, reason) })) return;
  socket.on('message', (data, binary) => { if (!binary) room.receive(id, data.toString()); });
  socket.on('close', () => { room.disconnect(id); if (!room.size) rooms.delete(roomId); });
  socket.on('error', () => room.disconnect(id));
});
const timer = setInterval(() => { for (const room of rooms.values()) room.tick(); }, 100);
http.listen(port, '0.0.0.0', () => console.log(`Temple realtime listening on ws://localhost:${port}/parties/temple/lotus-1`));
function shutdown() { clearInterval(timer); sockets.close(); http.close(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
