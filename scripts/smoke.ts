/** Run with both dev services running: pnpm exec tsx scripts/smoke.ts
 * Uses an isolated QA room and deletes only the UUIDs it creates in Neon.
 * Optional env: SMOKE_URL, SMOKE_REALTIME_URL. Never prints credentials/cookies.
 */
import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { WebSocket } from 'ws';
import type { ClientMessage, Player, ServerMessage } from '../src/lib/protocol';
import { findPath } from '../src/lib/world-layout';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
const web = process.env.SMOKE_URL || 'http://localhost:3000';
const workerLocal = process.argv.includes('--worker-local');
const realtime = process.env.SMOKE_REALTIME_URL || (workerLocal ? 'ws://127.0.0.1:1998' : 'ws://localhost:1999');
const origin = new URL(web).origin;
const run = Date.now().toString(36);
const profileIds: string[] = [];
const clients: TestClient[] = [];
type Profile = { id: string; name: string; avatar: number; merit: number };
type ApiResult = { status: number; data: Record<string, any>; cookie: string };

async function api(path: string, options: { method?: string; body?: unknown; cookie?: string; origin?: string } = {}): Promise<ApiResult> {
  const response = await fetch(`${web}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.cookie ? { Cookie: options.cookie } : {}), ...(options.method === 'POST' ? { Origin: options.origin || origin } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || options.cookie || '' };
}

async function guest(suffix: string, avatar = 0) {
  const result = await api('/api/guest', { method: 'POST', body: { name: `QA ${run} ${suffix}`, avatar } });
  assert.equal(result.status, 200, 'Guest creation should succeed');
  const profile = result.data.player as Profile;
  assert.match(profile.id, /^[0-9a-f-]{36}$/i);
  assert(profile.name.startsWith(`QA ${run}`));
  profileIds.push(profile.id);
  assert(result.cookie.startsWith('vto_guest='), 'Guest must receive a signed cookie');
  return { profile, cookie: result.cookie, mode: result.data.persistence as string };
}

async function waitFor(predicate: () => boolean, message: string, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${message}`);
    await sleep(20);
  }
}

class TestClient {
  socket: WebSocket;
  id = '';
  messages: ServerMessage[] = [];
  players: Player[] = [];
  constructor(room: string) {
    this.socket = new WebSocket(`${realtime.replace(/\/$/, '')}/parties/temple/${room}`);
    this.socket.on('message', (bytes) => {
      const message = JSON.parse(bytes.toString()) as ServerMessage;
      this.messages.push(message);
      if (message.type === 'welcome') { this.id = message.id; this.players = message.players; }
      if (message.type === 'state') this.players = message.players;
    });
    this.socket.on('error', () => {});
    clients.push(this);
  }
  send(message: ClientMessage) { this.socket.send(JSON.stringify(message)); }
  me() { return this.players.find((player) => player.id === this.id)!; }
  async join(name: string) {
    await waitFor(() => this.socket.readyState === WebSocket.OPEN, 'WebSocket open');
    this.send({ type: 'join', name, avatar: 0 });
    await waitFor(() => Boolean(this.id), 'welcome');
  }
  async move(x: number, z: number) {
    const initial = this.me();
    const path = findPath(initial.x, initial.z, x, z);
    assert(path.length, 'Smoke movement must have a valid path through the actual map');
    await sleep(110);
    for (const [tx, tz] of path) {
      while (Math.hypot(this.me().x - tx, this.me().z - tz) > .03) {
        const current = this.me();
        const dx = tx - current.x, dz = tz - current.z, distance = Math.hypot(dx, dz), step = Math.min(.6, distance);
        const nx = current.x + dx / distance * step, nz = current.z + dz / distance * step;
        this.send({ type: 'move', x: nx, z: nz, yaw: Math.atan2(dx, dz), animation: 'walk' });
        await waitFor(() => Math.hypot(this.me().x - nx, this.me().z - nz) < .03, 'server accepts reachable move', 2000);
        await sleep(75);
      }
    }
  }
}

async function checkApis() {
  const a = await guest('private');
  let reloaded = await api('/api/guest', { cookie: a.cookie });
  assert.equal(reloaded.data.player.id, a.profile.id, 'Reload restores the same guest');
  const updated = await api('/api/guest', { method: 'POST', cookie: a.cookie, body: { name: `QA ${run} renamed`, avatar: 3 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.player.id, a.profile.id, 'Profile update preserves identity');
  a.cookie = updated.cookie;
  reloaded = await api('/api/guest', { cookie: a.cookie });
  assert.equal(reloaded.data.player.avatar, 3, 'Avatar persists on reload');
  assert.equal(reloaded.data.player.name, `QA ${run} renamed`);
  assert.equal((await api('/api/guest', { method: 'POST', origin: 'https://unrelated.example', body: { name: 'QA invalid', avatar: 0 } })).status, 403);
  assert.equal((await api('/api/guest', { method: 'POST', body: { name: '<>', avatar: 0 } })).status, 400, 'Sanitizing a name to empty is rejected');
  assert.equal((await api('/api/guest', { method: 'POST', body: { name: 'QA invalid', avatar: 7 } })).status, 400, 'Impossible avatar is rejected');
  const tampered = await api('/api/guest', { cookie: `${a.cookie}x` });
  assert.equal(tampered.data.player, null, 'Tampered signature is rejected');
  assert.equal((await api('/api/guest', { cookie: `${a.cookie}.extra` })).data.player, null, 'Extra token segments are rejected');

  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) {
    for (const fields of [{ expires: undefined }, { expires: 'forever' }, { expires: Date.now() - 1 }, { avatar: 99, expires: Date.now() + 60000 }, { id: '-'.repeat(36), expires: Date.now() + 60000 }]) {
      const encoded = Buffer.from(JSON.stringify({ ...a.profile, expires: Date.now() + 60000, ...fields })).toString('base64url');
      const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
      const invalid = await api('/api/guest', { cookie: `vto_guest=${encoded}.${signature}` });
      assert.equal(invalid.data.player, null, 'Malformed/expired signed fields are rejected');
    }
  }
  const privatePrayer = await api('/api/prayers', { method: 'POST', cookie: a.cookie, body: { text: `QA private ${run}`, isPublic: false } });
  assert.equal(privatePrayer.status, 201);
  assert.equal(privatePrayer.data.prayer.isPublic, false);
  const feed = await api('/api/prayers');
  assert.equal(feed.status, 200);
  assert(!feed.data.prayers.some((prayer: { id: string }) => prayer.id === privatePrayer.data.prayer.id), 'Private prayer is never in public feed');
  assert.equal((await api('/api/prayers', { method: 'POST', cookie: a.cookie, body: { text: 'QA cooldown', isPublic: false } })).status, 429);
  assert.equal((await api('/api/prayers', { method: 'POST', body: { text: 'QA unauthenticated' } })).status, 401);

  const b = await guest('public', 1);
  const publicPrayer = await api('/api/prayers', { method: 'POST', cookie: b.cookie, body: { text: `QA public ${run}`, isPublic: true } });
  assert.equal(publicPrayer.status, 201);
  const publicFeed = await api('/api/prayers');
  assert(publicFeed.data.prayers.some((prayer: { id: string }) => prayer.id === publicPrayer.data.prayer.id), 'Public prayer appears in the board');
  assert(publicFeed.data.prayers.every((prayer: Record<string, unknown>) => !('playerId' in prayer)), 'Public feed hides account IDs');
  const c = await guest('race', 2);
  const race = await Promise.all([1, 2].map((n) => api('/api/prayers', { method: 'POST', cookie: c.cookie, body: { text: `QA concurrency ${run} ${n}`, isPublic: false } })));
  assert.deepEqual(race.map((result) => result.status).sort(), [201, 429], 'Concurrent writes obey the persisted cooldown');
  console.log(`PASS API: guest/profile/reload, origin, signed-session validation, private/public prayers, atomic cooldown (${a.mode}).`);
}

async function checkRealtime() {
  const room = workerLocal ? 'lotus-test' : `qa-${run}`;
  const a = new TestClient(room), b = new TestClient(room);
  await Promise.all([a.join(`QA ${run} A`), b.join(`QA ${run} B`)]);
  await waitFor(() => a.players.length === 2 && b.players.length === 2, 'two players see one another');
  a.send({ type: 'chat', text: `QA chat ${run}` });
  await waitFor(() => b.messages.some((m) => m.type === 'chat' && m.text === `QA chat ${run}`), 'room chat reaches second client');
  a.send({ type: 'combat', enabled: true });
  await waitFor(() => a.messages.some((m) => m.type === 'error'), 'combat outside arena is rejected');
  assert.equal(a.me().inCombat, false);
  const before = { x: b.me().x, z: b.me().z };
  b.send({ type: 'action', action: 'sit' });
  await waitFor(() => b.me().animation === 'sit', 'sit animation');
  await sleep(110);
  b.send({ type: 'move', x: before.x + .4, z: before.z, yaw: 0, animation: 'walk' });
  await sleep(160);
  assert.equal(b.me().x, before.x, 'Meditation locks movement');
  b.send({ type: 'action', action: 'idle' });
  await Promise.all([a.move(18, 6), b.move(19, 6)]);
  await waitFor(() => a.players.some((p) => p.id === b.id && Math.abs(p.x - 19) < .03), 'movement reaches second client');
  a.send({ type: 'combat', enabled: true });
  await waitFor(() => a.me().inCombat, 'first player opts into combat');
  a.send({ type: 'attack', targetId: b.id });
  await sleep(200);
  assert.equal(b.me().hp, 100, 'Nonconsenting target takes no damage');
  b.send({ type: 'combat', enabled: true });
  await waitFor(() => b.me().inCombat, 'second player opts into combat');
  await sleep(720);
  a.send({ type: 'attack', targetId: b.id });
  await waitFor(() => b.me().hp === 86, 'authoritative damage reaches target');
  a.send({ type: 'attack', targetId: b.id });
  await sleep(200);
  assert.equal(b.me().hp, 86, 'Attack cooldown rejects immediate repeated hit');
  console.log('PASS realtime: two clients, movement, chat, meditation lock, arena consent and server damage/cooldown.');
}

async function cleanup() {
  await Promise.all(clients.map((client) => new Promise<void>((resolve) => {
    if (client.socket.readyState === WebSocket.CLOSED) return resolve();
    const deadline = setTimeout(() => { client.socket.terminate(); resolve(); }, 1500);
    client.socket.once('close', () => { clearTimeout(deadline); resolve(); });
    client.socket.close(1000, 'Smoke complete');
  })));
  const url = process.env.DATABASE_URL || process.env.NEON_KEY;
  if (!url || !profileIds.length) return;
  const sql = neon(url);
  // Exact returned UUIDs only. Name guard provides an extra barrier against
  // ever deleting a player which this test did not create.
  for (const id of profileIds) {
    await sql.transaction([
      sql`DELETE FROM vto_prayers WHERE player_id = ${id}::uuid AND EXISTS (SELECT 1 FROM vto_players WHERE id = ${id}::uuid AND name LIKE ${`QA ${run}%`})`,
      sql`DELETE FROM vto_players WHERE id = ${id}::uuid AND name LIKE ${`QA ${run}%`}`,
    ]);
  }
  console.log(`Cleaned ${profileIds.length} QA-only guest records and their prayers.`);
}

async function main() {
  try {
    if (workerLocal) {
      const response = await fetch(`${realtime.replace(/^ws/, 'http')}/health`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).capacity, 20);
      console.log('PASS Worker health endpoint.');
    }
    if (!process.argv.includes('--realtime-only')) await checkApis();
    await checkRealtime();
  }
  finally { await cleanup(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Smoke test failed'); process.exitCode = 1; });
