import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { readFile, readdir } from 'node:fs/promises';
import { applyMigrations } from '../src/lib/migrations';
config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
const url = process.env.DATABASE_URL || process.env.NEON_KEY;
if (!url) throw new Error('Set DATABASE_URL (or existing NEON_KEY) before migrating.');
async function migrate() {
  const sql = neon(url!);
  const plan = await applyMigrations(
    await readdir('drizzle'),
    (file) => readFile(`drizzle/${file}`, 'utf8'),
    async (statements) => { await sql.transaction(statements.map((statement) => sql.query(statement))); },
  );
  if (plan.ignored.length) console.warn(`Ignored ${plan.ignored.length} unregistered SQL migration file(s). Only the canonical migration plan is executed.`);
  console.log('Virtual Temple tables are ready (additive vto_* migration).');
}
migrate().catch(() => { console.error('Migration failed. Check the Neon connection, canonical migration files and existing data constraints. No player data was deleted.'); process.exitCode = 1; });
