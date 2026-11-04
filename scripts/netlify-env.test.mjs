import { describe, expect, it } from 'vitest';
import { buildExportEnv, normalizeEnv, serializeEnv, validateEnv } from './netlify-env.mjs';

describe('Netlify environment import', () => {
  it('recovers named URLs from the old pasted format and removes the database trailing semicolon', () => {
    const env = normalizeEnv(`NEON_KEY=postgresql://owner:secret@example.neon.tech/neondb?sslmode=require;\nhttps://example.neonauth.aws.neon.tech/neondb/auth\nhttps://example.neonauth.aws.neon.tech/neondb/auth/.well-known/jwks.json\nhttps://example.rt.aws.neon.tech/\nhttps://example.apirest.aws.neon.tech/neondb/rest/v1\u00a0\n`);
    expect(env.DATABASE_URL.endsWith(';')).toBe(false);
    expect(env.NEON_AUTH_URL).toMatch(/\/auth$/);
    expect(env.NEON_JWKS_URL).toMatch(/\/jwks\.json$/);
    expect(env.NEON_REALTIME_URL).toBe('https://example.rt.aws.neon.tech');
    expect(env.NEON_DATA_API_URL).toMatch(/\/rest\/v1$/);
  });
  it('exports private storage aliases without any AWS-prefixed names or unrelated secrets', () => {
    const env = normalizeEnv('AWS_ENDPOINT_URL_S3=https://storage.invalid\nAWS_ACCESS_KEY_ID=legacy\nAWS_SECRET_ACCESS_KEY=old-secret\nAWS_REGION=us-east-2\nNEON_STORAGE_ACCESS_KEY_ID=current\nUNRELATED_SECRET=never-export\n');
    expect(env.NEON_STORAGE_ACCESS_KEY_ID).toBe('current');
    expect(env.NEON_STORAGE_SECRET_ACCESS_KEY).toBe('old-secret');
    const output = serializeEnv(env);
    expect(output).not.toContain('AWS_');
    expect(output).not.toContain('never-export');
  });
  it('preserves secret punctuation through dotenv round-trip and rejects line injection', () => {
    const env = { SESSION_SECRET: 'a#b$c&d=e\\f'.repeat(4) };
    expect(normalizeEnv(serializeEnv(env)).SESSION_SECRET).toBe(env.SESSION_SECRET);
    expect(() => serializeEnv({ SESSION_SECRET: 'secret\nINJECTED=1' })).toThrow('SESSION_SECRET');
  });
  it('keeps canonical names ahead of legacy aliases across local env files', () => {
    const env = buildExportEnv(['NEON_STORAGE_ACCESS_KEY_ID=canonical\n', 'AWS_ACCESS_KEY_ID=legacy\n']);
    expect(env.NEON_STORAGE_ACCESS_KEY_ID).toBe('canonical');
    expect(buildExportEnv(['NEON_STORAGE_ACCESS_KEY_ID=first\n', 'NEON_STORAGE_ACCESS_KEY_ID=second\n']).NEON_STORAGE_ACCESS_KEY_ID).toBe('second');
  });
  it('retains a previously configured public room URL and guest secret on repeat exports', () => {
    const previous = { SESSION_SECRET: 'existing-session-secret', NEXT_PUBLIC_REALTIME_URL: 'wss://previous.account.workers.dev' };
    const env = buildExportEnv(['NEXT_PUBLIC_REALTIME_URL=ws://localhost:1999\n'], previous);
    expect(env).toEqual(previous);
    expect(buildExportEnv([], previous, 'wss://new.account.workers.dev').NEXT_PUBLIC_REALTIME_URL).toBe('wss://new.account.workers.dev');
  });
  it('does not use an unrelated variable named undefined as a fallback for missing keys', () => {
    expect(normalizeEnv('undefined=unrelated-private-secret\n')).toEqual({});
  });
  it('never accepts a local game server or a Neon SQL endpoint as the production game room URL', () => {
    for (const url of ['ws://localhost:1999', 'wss://localhost:1999', 'https://example.rt.aws.neon.tech', 'wss://example.rt.aws.neon.tech', 'wss://worker.workers.dev/parties/temple/lotus-1']) {
      expect(validateEnv({ NEXT_PUBLIC_REALTIME_URL: url }).errors.some((line) => line.startsWith('NEXT_PUBLIC_REALTIME_URL'))).toBe(true);
    }
    expect(validateEnv({ NEXT_PUBLIC_REALTIME_URL: 'wss://worker.account.workers.dev' }).errors.some((line) => line.startsWith('NEXT_PUBLIC_REALTIME_URL'))).toBe(false);
  });
  it('makes missing room configuration explicit and does not echo malformed secret-bearing URLs', () => {
    const env = { DATABASE_URL: 'invalid-private-password', NEON_STORAGE_ENDPOINT: 'https://user:private-secret@storage.invalid' };
    const normal = validateEnv(env);
    const strict = validateEnv(env, true);
    expect(normal.warnings.some((line) => line.startsWith('NEXT_PUBLIC_REALTIME_URL'))).toBe(true);
    expect(strict.errors.some((line) => line.startsWith('NEXT_PUBLIC_REALTIME_URL'))).toBe(true);
    expect(JSON.stringify(strict)).not.toContain('private-secret');
    expect(JSON.stringify(strict)).not.toContain('invalid-private-password');
  });
});
