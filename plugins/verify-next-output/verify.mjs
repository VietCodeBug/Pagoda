import { readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const handlerName = '___netlify-server-handler';

/** Verify actual OpenNext artifacts, without executing a credential-bearing function. */
export async function verifyNextOutput({ projectDir, publishDir }) {
  const issues = [];
  const publish = resolve(projectDir, publishDir);
  const handlerDir = join(projectDir, '.netlify', 'functions-internal', handlerName);
  const handlerPath = join(handlerDir, `${handlerName}.mjs`);
  const manifestPath = join(handlerDir, `${handlerName}.json`);

  async function exists(path, directory = false) {
    try {
      const value = await stat(path);
      return directory ? value.isDirectory() : value.isFile();
    } catch { return false; }
  }

  if (!await exists(handlerPath)) issues.push('The generated Next.js server function is missing.');
  else {
    const handler = await readFile(handlerPath, 'utf8');
    if (!/path\s*:\s*['"]\/\*['"]/.test(handler)) issues.push('The Next.js server function has no catch-all route for / and /api/*.');
  }
  if (!await exists(manifestPath)) issues.push('The generated Next.js function manifest is missing.');
  if (!await exists(join(publish, '_next', 'static'), true)) issues.push('The publish directory has no _next/static client bundles.');
  for (const name of ['scene-credits.json', 'avatar.glb']) {
    if (!await exists(join(publish, 'assets', name))) issues.push(`The publish directory is missing assets/${name}.`);
  }
  if (await exists(join(publish, 'server', 'app', 'index.html'))) issues.push('The publish directory still contains raw Next.js server output instead of prepared CDN files.');
  return issues;
}
