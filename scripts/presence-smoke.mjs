/** Real-browser presence regression: tab close, reload, shared guest and room changes. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
const base = process.env.SMOKE_URL || 'http://localhost:3000';
const room = 'lotus-3';
const otherRoom = 'lotus-2';
const run = randomBytes(3).toString('hex');
const names = [`QA Leave ${run} A`, `QA Leave ${run} B`];
const createdAfter = new Date(Date.now() - 60_000).toISOString();
const profileIds = new Set();
const errors = [];
const results = [];
let persisted = false;
let browser;
let pageA;
let pageB;
await mkdir('artifacts', { recursive: true });

async function until(test, description, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await test()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

function observe(page) {
  const state = { id: '', room: '', players: [], welcomes: 0, snapshots: [], leavesSent: 0 };
  let generation = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => {
    const pathname = new URL(socket.url()).pathname;
    const match = pathname.match(/\/parties\/temple\/([a-z0-9-]+)$/);
    if (!match) return;
    const currentGeneration = ++generation;
    const currentRoom = match[1];
    socket.on('framereceived', ({ payload }) => {
      if (currentGeneration !== generation) return;
      let message;
      try { message = JSON.parse(String(payload)); } catch { return; }
      if (message.type === 'welcome') {
        state.id = message.id;
        state.room = message.roomId;
        state.welcomes++;
      }
      if (message.type === 'welcome' || message.type === 'state') {
        state.players = message.players;
        // Store only this run's QA identities, never guest cookies, tickets or receipts.
        state.snapshots.push({ room: currentRoom, ids: message.players.filter(player => names.includes(player.name)).map(player => player.id) });
      }
    });
    socket.on('framesent', ({ payload }) => {
      try { if (JSON.parse(String(payload)).type === 'leave') state.leavesSent++; } catch { /* Ignore unrelated frames. */ }
    });
  });
  return state;
}

async function waitForEntry(page) {
  await page.getByRole('heading', { name: /Một khoảng/ }).waitFor({ timeout: 90_000 });
  await page.locator('.loading-veil').waitFor({ state: 'hidden', timeout: 90_000 });
}

async function loadEntry(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await waitForEntry(page);
}

async function enter(page, name, state) {
  const previousWelcomes = state.welcomes;
  await page.locator('#guest-name').fill(name);
  await page.getByLabel('Chọn phòng', { exact: true }).selectOption(room);
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/guest' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Bước vào chùa', exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, 'The QA guest must save successfully');
  const guest = await response.json();
  assert.match(guest.player?.id || '', /^[0-9a-f-]{36}$/i);
  profileIds.add(guest.player.id);
  persisted ||= guest.persistence === 'neon';
  await until(() => state.welcomes > previousWelcomes && state.room === room, 'a fresh room welcome');
  await expect(page.locator('.room-badge')).toContainText(/\d+\/20/);
  return guest.player;
}

function qaIds(state) {
  return state.players.filter(player => names.includes(player.name)).map(player => player.id).sort();
}

async function assertPresence(state, ids, description) {
  const expected = [...ids].sort();
  await until(() => JSON.stringify(qaIds(state)) === JSON.stringify(expected), description, 10_000);
  assert.deepEqual(qaIds(state), expected, description);
}

async function changeRoom(page, target) {
  await page.bringToFront();
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  await page.getByLabel('Đổi phòng', { exact: true }).selectOption(target);
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
}

async function cleanupGuests() {
  if (!persisted || !profileIds.size) return;
  const url = process.env.DATABASE_URL || process.env.NEON_KEY;
  if (!url) throw new Error('QA cleanup needs the matching private Neon configuration.');
  const sql = neon(url);
  let deleted = 0;
  for (const id of profileIds) {
    // Fixed application table names; the UUID, exact QA name and creation time guard every deletion.
    for (const table of ['vto_game_claims', 'vto_fish_collection', 'vto_activity_scores', 'vto_game_wallets', 'vto_prayers']) {
      const [exists] = await sql.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
      if (!exists.name) continue;
      await sql.query(`DELETE FROM ${table} WHERE player_id=$1::uuid AND EXISTS (
        SELECT 1 FROM vto_players WHERE id=$1::uuid AND name IN ($2,$3) AND created_at >= $4::timestamptz
      )`, [id, ...names, createdAfter]);
    }
    const removed = await sql.query('DELETE FROM vto_players WHERE id=$1::uuid AND name IN ($2,$3) AND created_at >= $4::timestamptz RETURNING id', [id, ...names, createdAfter]);
    deleted += removed.length;
  }
  assert.equal(deleted, profileIds.size, 'Every exact QA guest created by this run must be cleaned');
  console.log(`Cleaned ${deleted} exact presence QA profile(s), game data and prayers.`);
}

try {
  const args = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (process.env.SMOKE_SOFTWARE_RENDERER === '1') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args });
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('vto-quality', 'low'));
  pageA = await context.newPage();
  let a = observe(pageA);
  await loadEntry(pageA);
  const guestA = await enter(pageA, names[0], a);

  // A real opener copies sessionStorage too: duplicate-tab identity must still keep both tabs online.
  const popup = context.waitForEvent('page');
  await pageA.evaluate(url => { window.open(url, '_blank'); }, base);
  pageB = await popup;
  const b = observe(pageB);
  await loadEntry(pageB);
  const sharedResponse = await pageB.request.get(new URL('/api/guest', base).href);
  const sharedGuest = await sharedResponse.json();
  assert.equal(sharedGuest.player?.id, guestA.id, 'The second tab inherits the same guest cookie');
  const guestB = await enter(pageB, names[1], b);
  assert.equal(guestB.id, guestA.id, 'The opened tab must keep the shared saved profile');
  assert.notEqual(a.id, b.id, 'Tabs sharing a cookie and copied sessionStorage need distinct avatars');
  await assertPresence(b, [a.id, b.id], 'observer sees two distinct shared-guest tabs');
  await assertPresence(a, [a.id, b.id], 'actor sees the same two tabs');
  results.push('Two tabs share one guest cookie and copied sessionStorage while retaining distinct online avatars');

  const closedId = a.id;
  await pageA.close();
  await assertPresence(b, [b.id], 'closing the actor tab promptly removes its old avatar');
  assert.ok(!b.players.some(player => player.id === closedId));
  results.push('Closing a tab removes its avatar from the other tab without waiting for transport timeout');

  pageA = await context.newPage();
  a = observe(pageA);
  await loadEntry(pageA);
  const reopened = await enter(pageA, names[0], a);
  assert.equal(reopened.id, guestA.id, 'Reopening keeps the saved guest profile');
  await assertPresence(b, [a.id, b.id], 'reopened actor adds one avatar only');
  assert.ok(!b.players.some(player => player.id === closedId));

  for (let index = 0; index < 3; index++) {
    const oldId = a.id;
    await pageA.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await waitForEntry(pageA);
    await assertPresence(b, [b.id], `reload ${index + 1} removes the old avatar before reentry`);
    const rejoined = await enter(pageA, names[0], a);
    assert.equal(rejoined.id, guestA.id, 'Reload keeps the saved profile');
    assert.notEqual(a.id, oldId, 'Reload creates a new transport connection');
    await assertPresence(b, [a.id, b.id], `reload ${index + 1} adds one fresh avatar`);
    assert.ok(!b.players.some(player => player.id === oldId), 'The superseded ID must disappear');
  }
  results.push('Three reload/reentry cycles remove every old connection and never accumulate duplicate avatars');

  const oldRoomId = a.id;
  const beforeSwitch = a.welcomes;
  await changeRoom(pageA, otherRoom);
  await until(() => a.welcomes > beforeSwitch && a.room === otherRoom, 'actor joins the second room');
  await assertPresence(b, [b.id], 'moving rooms removes the actor from the old room');
  assert.ok(!b.players.some(player => player.id === oldRoomId));
  const beforeReturn = a.welcomes;
  await changeRoom(pageA, room);
  await until(() => a.welcomes > beforeReturn && a.room === room, 'actor rejoins the original room');
  await assertPresence(b, [a.id, b.id], 'returning rooms adds one actor only');
  const returnedActor = b.players.find(player => player.id === a.id);
  const observer = b.players.find(player => player.id === b.id);
  assert.ok(returnedActor && observer && Math.hypot(returnedActor.x - observer.x, returnedActor.z - observer.z) > 1, 'Returning players must spawn separately from the existing avatar');
  results.push('Changing rooms removes the old-room avatar; returning produces exactly one active avatar');
  results.push('The returning avatar spawns more than one metre away from the existing player');

  assert.ok(b.snapshots.length > 0, 'The observer must receive real server snapshots');
  assert.ok(b.snapshots.every(snapshot => snapshot.ids.length <= 2), 'No observer snapshot may contain more than the two live QA avatars');
  assert.deepEqual(errors, [], 'Presence flows must not report browser runtime errors');
  await pageB.bringToFront();
  await pageB.screenshot({ path: 'artifacts/presence-game.png' });
  await writeFile('artifacts/presence-results.json', JSON.stringify({ results, errors, observerSnapshots: b.snapshots.length, maxQaAvatars: Math.max(...b.snapshots.map(snapshot => snapshot.ids.length)) }, null, 2));
  console.log(JSON.stringify({ passed: results, errors }));
} catch (error) {
  await pageA?.screenshot({ path: 'artifacts/presence-failure-a.png' }).catch(() => {});
  await pageB?.screenshot({ path: 'artifacts/presence-failure-b.png' }).catch(() => {});
  await writeFile('artifacts/presence-results.json', JSON.stringify({ results, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await cleanupGuests();
}
