import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { verifyNextOutput } from './verify.mjs';

const fixtures = [];
async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'temple-netlify-output-'));
  fixtures.push(root);
  for (const [name, content] of Object.entries(files)) {
    const destination = join(root, name);
    await mkdir(resolve(destination, '..'), { recursive: true });
    await writeFile(destination, content);
  }
  return root;
}
afterEach(async () => {
  for (const root of fixtures.splice(0)) {
    const target = resolve(root);
    const allowed = resolve(tmpdir()) + sep;
    if (!target.startsWith(allowed) || !target.split(sep).at(-1).startsWith('temple-netlify-output-')) throw new Error('Invalid fixture cleanup path');
    await rm(target, { recursive: true, force: true });
  }
});

describe('Netlify Next.js deploy output', () => {
  const handler = '.netlify/functions-internal/___netlify-server-handler/___netlify-server-handler';
  const prepared = {
    [`${handler}.mjs`]: "export const config = { path: '/*', preferStatic: true };",
    [`${handler}.json`]: '{"version":1}',
    '.next/_next/static/app.js': 'client bundle',
    '.next/assets/scene-credits.json': '{}',
    '.next/assets/avatar.glb': 'avatar bytes',
  };
  it('rejects the exact raw .next layout that serves /server/app/index.html but returns 404 at /', async () => {
    const root = await fixture({ '.next/server/app/index.html': '<html>game</html>', '.next/static/app.js': 'bundle' });
    const issues = await verifyNextOutput({ projectDir: root, publishDir: join(root, '.next') });
    expect(issues).toContain('The generated Next.js server function is missing.');
    expect(issues).toContain('The publish directory still contains raw Next.js server output instead of prepared CDN files.');
  });
  it('accepts CDN assets with a generated catch-all function, without requiring a static index.html', async () => {
    const root = await fixture(prepared);
    expect(await verifyNextOutput({ projectDir: root, publishDir: '.next' })).toEqual([]);
  });
  it('rejects a function that cannot route /api/guest even when the asset upload is complete', async () => {
    const root = await fixture({ ...prepared, [`${handler}.mjs`]: "export const config = { path: '/unrelated' };" });
    expect(await verifyNextOutput({ projectDir: root, publishDir: '.next' })).toContain('The Next.js server function has no catch-all route for / and /api/*.');
  });
});
