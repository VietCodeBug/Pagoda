import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });
export default defineConfig({ schema: './src/lib/server/schema.ts', out: './drizzle', dialect: 'postgresql', dbCredentials: { url: process.env.DATABASE_URL || process.env.NEON_KEY || '' } });
