import { describe, expect, it } from 'vitest';
import { publicPrayerRows } from './prayer-stream';
import { neonRealtimeConfig, RealtimeConfigurationError } from './server/neon-realtime-config';

const id = '00000000-0000-4000-8000-000000000001';
const publicRow = { id, name: 'An Nhiên', text: 'Bình an.', createdAt: new Date('2026-11-04T01:00:00Z') };

describe('public prayer stream boundary', () => {
  it('excludes private rows and internal fields from live updates', () => {
    const rows = publicPrayerRows([
      { ...publicRow, playerId: 'private-owner-id', arbitrary: 'hidden' },
      { ...publicRow, id: '00000000-0000-4000-8000-000000000002', isPublic: false },
      { ...publicRow, id: '00000000-0000-4000-8000-000000000003', is_public: false },
    ]);
    expect(rows).toEqual([{ id, name: 'An Nhiên', text: 'Bình an.', createdAt: '2026-11-04T01:00:00.000Z' }]);
    expect(JSON.stringify(rows)).not.toContain('private-owner-id');
  });

  it('rejects malformed upstream rows instead of displaying unvalidated content', () => {
    expect(publicPrayerRows([{ ...publicRow, id: 'not-a-uuid' }, { ...publicRow, createdAt: 'invalid' }, { ...publicRow, text: 'x'.repeat(501) }, null])).toEqual([]);
    expect(publicPrayerRows({ prayers: [publicRow] })).toEqual([]);
  });

  it('accepts transport timestamps and bounds the rendered public journal', () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({ ...publicRow, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, createdAt: '2026-11-04T01:00:00+00:00' }));
    expect(publicPrayerRows(rows)).toHaveLength(40);
    expect(publicPrayerRows(rows)[0].createdAt).toBe('2026-11-04T01:00:00.000Z');
  });
});

describe('Neon Realtime configuration', () => {
  it('requires the dedicated Realtime secret rather than substituting the PostgreSQL password', () => {
    const env = { NEON_KEY: 'postgresql://owner:database-password@example.neon.tech/neondb', NEON_REALTIME_URL: 'https://example.rt.aws.neon.tech/' };
    try { neonRealtimeConfig(env); throw new Error('Expected configuration rejection'); }
    catch (error) {
      expect(error).toBeInstanceOf(RealtimeConfigurationError);
      expect((error as RealtimeConfigurationError).missing).toContain('NEON_REALTIME_SECRET');
      expect(String(error)).not.toContain('database-password');
    }
  });

  it('converts the supplied HTTPS endpoint to WSS and preserves the configured database', () => {
    const config = neonRealtimeConfig({ NEON_KEY: 'postgresql://owner:password@example.neon.tech/neondb?sslmode=require', NEON_REALTIME_URL: 'https://example.rt.aws.neon.tech/', NEON_REALTIME_SECRET: 'server-only' });
    expect(config).toEqual({ url: 'wss://example.rt.aws.neon.tech/', database: 'neondb', secret: 'server-only' });
  });

  it('rejects insecure remote endpoints and credentials embedded in URLs', () => {
    const env = { NEON_REALTIME_DATABASE: 'neondb', NEON_REALTIME_SECRET: 'server-only' };
    for (const url of ['http://example.com/', 'ws://example.com/', 'wss://user:secret@example.com/', 'wss://example.com/?secret=bad']) {
      expect(() => neonRealtimeConfig({ ...env, NEON_REALTIME_URL: url })).toThrow(RealtimeConfigurationError);
    }
    expect(neonRealtimeConfig({ ...env, NEON_REALTIME_URL: 'http://localhost:9000' }).url).toBe('ws://localhost:9000/');
  });
});
