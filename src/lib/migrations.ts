/** Canonical additive migrations. New SQL must be registered here before execution. */
export const MIGRATION_FILES = [
  '0000_virtual_temple.sql',
  '0001_public_prayer_api.sql',
  '0002_restore_validation.sql',
] as const;

export function migrationPlan(availableFiles: readonly string[]) {
  const missing = MIGRATION_FILES.filter((file) => !availableFiles.includes(file));
  if (missing.length) throw new Error(`Missing canonical migration files: ${missing.join(', ')}`);
  return {
    files: [...MIGRATION_FILES],
    ignored: availableFiles.filter((file) => file.endsWith('.sql') && !(MIGRATION_FILES as readonly string[]).includes(file)).sort(),
  };
}

/** Explicit boundaries keep procedural SQL and quoted semicolons intact. */
export function migrationStatements(source: string) {
  const statements = source.split(/^\s*--> statement-breakpoint\s*$/m).map((statement) => statement.trim()).filter(Boolean);
  if (!statements.length) throw new Error('Canonical migration contains no SQL.');
  return statements;
}

export async function applyMigrations(
  files: readonly string[],
  readSource: (file: string) => Promise<string>,
  transaction: (statements: string[]) => Promise<void>,
) {
  const plan = migrationPlan(files);
  for (const file of plan.files) await transaction(migrationStatements(await readSource(file)));
  return plan;
}
