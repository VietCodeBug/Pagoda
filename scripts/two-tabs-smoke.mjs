/** Real browser regression: two tabs share one guest cookie but have separate room connections. */
import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
const base = process.env.SMOKE_URL || 'http://localhost:3000';
const run = randomBytes(3).toString('hex');
const names = [`QA Tabs ${run} A`, `QA Tabs ${run} B`];
const room = 'lotus-3';
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

function observeRoom(page) {
  const state = { id: '', players: [], messages: [], movesSent: 0 };
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => {
    if (!new URL(socket.url()).pathname.endsWith(`/parties/temple/${room}`)) return;
    socket.on('framereceived', ({ payload }) => {
      let data;
      try { data = JSON.parse(String(payload)); } catch { return; }
      if (data.type === 'welcome') { state.id = data.id; state.players = data.players; }
      if (data.type === 'state') state.players = data.players;
      if (data.type === 'chat') state.messages.push(data);
    });
    socket.on('framesent', ({ payload }) => {
      try { if (JSON.parse(String(payload)).type === 'move') state.movesSent++; } catch { /* Other frames are irrelevant. */ }
    });
  });
  return state;
}

async function loadEntry(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.getByRole('heading', { name: /Một khoảng/ }).waitFor({ timeout: 90_000 });
  await page.locator('.loading-veil').waitFor({ state: 'hidden', timeout: 90_000 });
}

async function enter(page, name) {
  await page.locator('#guest-name').fill(name);
  await page.getByLabel('Chọn phòng', { exact: true }).selectOption(room);
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/guest' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Bước vào chùa', exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, 'The test guest must be saved successfully');
  const data = await response.json();
  assert.match(data.player?.id || '', /^[0-9a-f-]{36}$/i, 'Guest response must return its saved UUID');
  profileIds.add(data.player.id);
  persisted ||= data.persistence === 'neon';
  await page.locator('.room-badge').filter({ hasText: /\d+\/20/ }).waitFor({ timeout: 30_000 });
  return data.player;
}

async function cleanupGuests() {
  if (!persisted || !profileIds.size) return;
  const url = process.env.DATABASE_URL || process.env.NEON_KEY;
  if (!url) throw new Error('QA cleanup needs the matching server-only Neon configuration.');
  const sql = neon(url);
  let removed = 0;
  for (const id of profileIds) {
    const [, players] = await sql.transaction([
      sql`DELETE FROM vto_prayers WHERE player_id = ${id}::uuid AND EXISTS (
        SELECT 1 FROM vto_players WHERE id = ${id}::uuid AND name IN (${names[0]}, ${names[1]}) AND created_at >= ${createdAfter}::timestamptz
      )`,
      sql`DELETE FROM vto_players WHERE id = ${id}::uuid AND name IN (${names[0]}, ${names[1]}) AND created_at >= ${createdAfter}::timestamptz RETURNING id`,
    ]);
    removed += players.length;
  }
  assert.equal(removed, profileIds.size, 'Every exact QA guest created by this run must be cleaned');
  console.log(`Cleaned ${removed} exact QA guest profile(s) and their prayers.`);
}

try {
  const args = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (process.env.SMOKE_SOFTWARE_RENDERER === '1') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args });
  // Both pages deliberately use this one context. browser.newPage() would create separate cookies.
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('vto-quality', 'low'));
  pageA = await context.newPage();
  const a = observeRoom(pageA);
  await loadEntry(pageA);
  const guestA = await enter(pageA, names[0]);
  await until(() => !!a.id, 'tab A receives a real WebSocket welcome');

  pageB = await context.newPage();
  const b = observeRoom(pageB);
  await loadEntry(pageB);
  const sharedResponse = await pageB.request.get(new URL('/api/guest', base).href);
  const sharedGuest = await sharedResponse.json();
  assert.equal(sharedGuest.player?.id, guestA.id, 'Tab B must inherit tab A’s saved guest through the shared browser context');
  const guestB = await enter(pageB, names[1]);
  assert.equal(guestB.id, guestA.id, 'The two tabs must still share one saved guest profile');
  await until(() => !!b.id && a.players.some((p) => p.id === b.id) && b.players.some((p) => p.id === a.id), 'both tabs receive both players');
  assert.notEqual(a.id, b.id, 'Shared guest cookie must not collapse the two WebSocket connections');
  assert.ok(a.players.length >= 2 && b.players.length >= 2);
  await expect(pageA.locator('.room-badge')).toContainText(`${a.players.length}/20`);
  await expect(pageB.locator('.room-badge')).toContainText(`${b.players.length}/20`);
  await expect(pageA.getByText(names[1], { exact: true })).toBeVisible();
  await expect(pageB.getByText(names[0], { exact: true })).toBeVisible();
  results.push('One browser context shares one saved guest, while two distinct player IDs and both remote avatars are visible');

  const message = `Two-tab chat ${run}`;
  await pageA.bringToFront();
  await pageA.keyboard.press('Enter');
  await pageA.getByLabel('Tin nhắn', { exact: true }).fill(message);
  await pageA.getByLabel('Tin nhắn', { exact: true }).press('Enter');
  await until(() => b.messages.some((m) => m.playerId === a.id && m.text === message), 'tab B receives tab A chat');
  await expect(pageB.locator('.chat-log').getByText(message, { exact: true })).toBeVisible();
  results.push('Chat from tab A reaches tab B through the real room server');

  const before = b.players.find((p) => p.id === a.id);
  assert.ok(before, 'Tab B knows tab A’s initial position');
  await pageA.locator('canvas').focus();
  await pageA.keyboard.down('KeyW');
  try {
    await until(() => {
      const after = b.players.find((p) => p.id === a.id);
      return a.movesSent > 0 && after && Math.hypot(after.x - before.x, after.z - before.z) > 1.2;
    }, 'actual WASD movement from tab A updates tab B', 12_000);
  } finally { await pageA.keyboard.up('KeyW'); }
  results.push('Actual WASD displacement is observed in the other tab’s server snapshots');
  await pageB.bringToFront();
  await pageB.screenshot({ path: 'artifacts/two-tabs-game.png' });
  assert.deepEqual(errors, [], 'Two-tab browser runtime must not report errors');
  await writeFile('artifacts/two-tabs-results.json', JSON.stringify({ results, errors, sharedGuest: true, distinctConnections: true }, null, 2));
  console.log(JSON.stringify({ passed: results, errors }));
} catch (error) {
  await pageA?.screenshot({ path: 'artifacts/two-tabs-failure-a.png' }).catch(() => {});
  await pageB?.screenshot({ path: 'artifacts/two-tabs-failure-b.png' }).catch(() => {});
  await writeFile('artifacts/two-tabs-results.json', JSON.stringify({ results, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await cleanupGuests();
}
