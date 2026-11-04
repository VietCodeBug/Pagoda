import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFile, readdir } from 'node:fs/promises';
config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
const url = process.env.DATABASE_URL || process.env.NEON_KEY;
if (!url) throw new Error('Set DATABASE_URL (or existing NEON_KEY) before migrating.');
async function migrate() {
  const sql = neon(url!);
  const files = (await readdir('drizzle')).filter(name => name.endsWith('.sql')).sort();
  for (const file of files) {
    const migration = await readFile(`drizzle/${file}`, 'utf8');
    const statements = migration.split(';').map((s) => s.trim()).filter(Boolean);
    await sql.transaction(statements.map((statement) => sql.query(statement)));
  }
  console.log('Virtual Temple tables are ready (additive vto_* migration).');
}
migrate().catch(() => { console.error('Migration failed. Verify the server-only Neon URL and network access.'); process.exitCode = 1; });
