/** Real browser flow: navigate to the pond, catch a server-rolled fish and reload its saved collection. */
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
const run = randomBytes(3).toString('hex');
const names = [`QA Fish ${run} A`, `QA Fish ${run} B`, `QA Fish ${run} C`];
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
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out: ${description}`);
}

function observe(page) {
  const state = { id: '', players: [], activity: null, effects: [], rewards: [] };
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => {
    if (!new URL(socket.url()).pathname.endsWith(`/parties/temple/${room}`)) return;
    socket.on('framereceived', ({ payload }) => {
      let message;
      try { message = JSON.parse(String(payload)); } catch { return; }
      if (message.type === 'welcome') { state.id = message.id; state.players = message.players; }
      if (message.type === 'state') state.players = message.players;
      if (message.type === 'activity_state') state.activity = message.state;
      if (message.type === 'activity_effect') state.effects.push(message.effect);
      // Receipts stay in memory for an idempotency check; never write or print them.
      if (message.type === 'activity_reward') state.rewards.push(message);
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
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/guest' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Bước vào chùa', exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, 'Guest must persist before testing game rewards');
  const guest = await response.json();
  assert.match(guest.player?.id || '', /^[0-9a-f-]{36}$/i);
  profileIds.add(guest.player.id);
  persisted ||= guest.persistence === 'neon';
  await page.locator('.room-badge').filter({ hasText: /\d+\/20/ }).waitFor({ timeout: 30_000 });
  return guest.player;
}

async function progress(page) {
  const response = await page.request.get(new URL('/api/game/progress', base).href);
  assert.equal(response.status(), 200, 'Game progress requires its migration and matching session secret');
  return response.json();
}
const totalFish = value => value.fish.reduce((sum, fish) => sum + fish.amount, 0);

async function cleanup() {
  if (!persisted || !profileIds.size) return;
  const url = process.env.DATABASE_URL || process.env.NEON_KEY;
  if (!url) throw new Error('QA cleanup needs the same private Neon configuration as the app.');
  const sql = neon(url);
  let deleted = 0;
  // These identifiers are a fixed application allowlist, never user input.
  for (const id of profileIds) {
    for (const table of ['vto_game_claims', 'vto_fish_collection', 'vto_activity_scores', 'vto_game_wallets', 'vto_prayers']) {
      const [exists] = await sql.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
      if (!exists.name) continue;
      await sql.query(`DELETE FROM ${table} WHERE player_id=$1::uuid AND EXISTS (
        SELECT 1 FROM vto_players WHERE id=$1::uuid AND name IN ($2,$3,$4) AND created_at >= $5::timestamptz
      )`, [id, ...names, createdAfter]);
    }
    const removed = await sql.query('DELETE FROM vto_players WHERE id=$1::uuid AND name IN ($2,$3,$4) AND created_at >= $5::timestamptz RETURNING id', [id, ...names, createdAfter]);
    deleted += removed.length;
  }
  assert.equal(deleted, profileIds.size, 'Every exact activity QA profile must be cleaned');
  console.log(`Cleaned ${deleted} exact activity QA profile(s), game data and prayers.`);
}

try {
  const args = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (process.env.SMOKE_SOFTWARE_RENDERER === '1') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('vto-quality', 'low'));
  pageA = await context.newPage();
  const a = observe(pageA);
  await loadEntry(pageA);
  const guestA = await enter(pageA, names[0]);
  const before = await progress(pageA);

  pageB = await context.newPage();
  const b = observe(pageB);
  await loadEntry(pageB);
  const guestB = await enter(pageB, names[1]);
  assert.equal(guestB.id, guestA.id, 'Two tabs must share the same saved guest cookie');
  await until(() => a.id && b.id && a.id !== b.id && a.players.some(player => player.id === b.id) && b.players.some(player => player.id === a.id), 'distinct players share one room');
  results.push('Same-browser tabs share a guest profile while retaining distinct online avatars');

  await pageA.bringToFront();
  await pageA.getByRole('button', { name: 'Mở hoạt động và bộ sưu tập' }).click();
  await expect(pageA.locator('.activity-mode-card')).toHaveCount(8);
  await pageA.getByRole('button', { name: 'Chỉ đường tới Câu cá thư giãn', exact: true }).click();
  await until(() => {
    const me = a.players.find(player => player.id === a.id);
    return me && Math.hypot(me.x + 8.7, me.z - 6) < 2.2;
  }, 'real navigation reaches the fishing bank', 35_000);
  await pageA.locator('.interaction-prompt').filter({ hasText: 'Câu cá' }).waitFor();
  await pageA.locator('canvas').focus();
  await pageA.keyboard.press('KeyE');
  await until(() => a.activity?.mode === 'fishing' && a.activity.phase === 'idle', 'fishing mode starts at the bank');
  await expect(pageA.locator('.interaction-prompt')).toHaveCount(0);
  results.push('Guided movement and E start fishing without a contradictory nearby prompt');

  await pageA.getByRole('button', { name: /^Thả câu/ }).click();
  await until(() => a.activity?.phase === 'waiting' && b.players.some(player => player.id === a.id && player.animation === 'fish') && b.effects.some(effect => effect.playerId === a.id && effect.kind === 'cast'), 'other tab sees fishing pose and cast');
  await pageA.screenshot({ path: 'artifacts/activities-fishing-online.png' });
  results.push('The second tab receives fishing pose and cast effects through the real room server');

  await until(() => a.activity?.phase === 'bite', 'server decides the fish bite', 12_000);
  const claimPromise = pageA.waitForResponse(response => new URL(response.url()).pathname === '/api/game/claim' && response.request().method() === 'POST', { timeout: 20_000 });
  await pageA.locator('.fish-bite-action').click({ timeout: 1200 });
  const claimResponse = await claimPromise;
  assert.equal(claimResponse.status(), 200, 'A genuine signed catch must save to Neon');
  const claim = await claimResponse.json();
  assert.equal(claim.applied, true);
  await until(() => b.effects.some(effect => effect.playerId === a.id && effect.kind === 'catch'), 'other tab sees the catch effect');
  const afterCatch = await progress(pageA);
  assert.equal(totalFish(afterCatch), totalFish(before) + 1);
  assert.ok(afterCatch.coins > before.coins);
  assert.ok(afterCatch.xp > before.xp);
  const reward = a.rewards.find(message => message.reward.fish && message.receipt);
  assert.ok(reward, 'The server must issue a signed catch receipt');
  const duplicateResponse = await pageA.request.post(new URL('/api/game/claim', base).href, { data: { receipt: reward.receipt } });
  assert.equal(duplicateResponse.status(), 200);
  const duplicate = await duplicateResponse.json();
  assert.equal(duplicate.applied, false, 'Replaying the catch receipt must not award again');
  assert.equal(totalFish(duplicate.progress), totalFish(afterCatch));
  assert.equal(duplicate.progress.coins, afterCatch.coins);
  results.push('A real reaction catch saves fish, coins and XP once; receipt replay gives no duplicate reward');

  const otherContext = await browser.newContext();
  try {
    const otherGuestResponse = await otherContext.request.post(new URL('/api/guest', base).href, { data: { name: names[2], avatar: 0 }, headers: { Origin: new URL(base).origin } });
    assert.equal(otherGuestResponse.status(), 200);
    const otherGuest = await otherGuestResponse.json();
    assert.notEqual(otherGuest.player.id, guestA.id);
    profileIds.add(otherGuest.player.id);
    persisted ||= otherGuest.persistence === 'neon';
    const denied = await otherContext.request.post(new URL('/api/game/claim', base).href, { data: { receipt: reward.receipt }, headers: { Origin: new URL(base).origin } });
    assert.equal(denied.status(), 403, 'A signed catch receipt must remain bound to its original guest profile');
    const untouched = await progress(otherContext);
    assert.equal(totalFish(untouched), 0);
    assert.equal(untouched.coins, 0);
    results.push('A separate guest receives HTTP 403 for another profile’s receipt and gains no fish or coins');
  } finally { await otherContext.close(); }

  await pageA.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await pageA.getByRole('heading', { name: /Một khoảng/ }).waitFor();
  await pageA.locator('.loading-veil').waitFor({ state: 'hidden', timeout: 90_000 });
  const reentered = await enter(pageA, names[0]);
  assert.equal(reentered.id, guestA.id);
  const restored = await progress(pageA);
  assert.equal(totalFish(restored), totalFish(afterCatch));
  assert.equal(restored.coins, afterCatch.coins);
  await pageA.getByRole('button', { name: 'Mở hoạt động và bộ sưu tập' }).click();
  await pageA.getByRole('button', { name: /Sổ cá/ }).click();
  await expect(pageA.locator('.fish-collection-card.discovered')).toHaveCount(1);
  await pageA.locator('.fish-collection-card.discovered').scrollIntoViewIfNeeded();
  await pageA.screenshot({ path: 'artifacts/activities-saved-collection.png' });
  results.push('Reloading and rejoining restores the actual fish collection and wallet from Neon');
  assert.deepEqual(errors, [], 'The activity flow must not produce browser runtime errors');
  await writeFile('artifacts/activities-results.json', JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results, errors }));
} catch (error) {
  await pageA?.screenshot({ path: 'artifacts/activities-failure.png' }).catch(() => {});
  await writeFile('artifacts/activities-results.json', JSON.stringify({ results, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await cleanup();
}
