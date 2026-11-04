import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { applyMigrations, MIGRATION_FILES, migrationPlan, migrationStatements } from './migrations';

describe('canonical database migrations', () => {
  it('does not execute a duplicate generated baseline, even if it sorts first', async () => {
    const available: string[] = [...MIGRATION_FILES].reverse();
    available.push('0000_little_mathemanic.sql');
    const read: string[] = [];
    const executed: string[][] = [];
    const plan = await applyMigrations(available, async (file) => { read.push(file); return 'SELECT 1;'; }, async (statements) => { executed.push(statements); });
    expect(read).toEqual(MIGRATION_FILES);
    expect(executed).toHaveLength(MIGRATION_FILES.length);
    expect(plan.ignored).toEqual(['0000_little_mathemanic.sql']);
  });

  it('checks the whole plan before applying any migration', async () => {
    let began = false;
    await expect(applyMigrations(['0000_virtual_temple.sql'], async () => 'SELECT 1;', async () => { began = true; })).rejects.toThrow('Missing canonical migration');
    expect(began).toBe(false);
  });

  it('preserves procedural bodies and quoted semicolons as a single transaction statement', () => {
    const source = "DO $$ BEGIN PERFORM ';'; PERFORM 2; END $$;\n--> statement-breakpoint\nSELECT 'a;b';";
    expect(migrationStatements(source)).toEqual(["DO $$ BEGIN PERFORM ';'; PERFORM 2; END $$;", "SELECT 'a;b';"]);
    expect(() => migrationStatements(' \n ')).toThrow('contains no SQL');
  });

  it('keeps Drizzle journal order in sync with the actual files and explicit runner', async () => {
    const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
    expect(journal.entries.map((entry: { tag: string }) => `${entry.tag}.sql`)).toEqual(MIGRATION_FILES);
    expect(migrationPlan(await readdir('drizzle')).ignored).toEqual([]);
  });
});
