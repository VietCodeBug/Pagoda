import { describe, expect, it } from 'vitest';
import { DEFAULT_REALTIME_URL, realtimeRoomConfig } from './realtime-config';

const browser = { hostname: 'temple.netlify.app', secure: true };
describe('runtime multiplayer configuration', () => {
  it('reads the dedicated runtime URL ahead of the legacy build variable and normalizes Worker HTTPS', () => {
    expect(realtimeRoomConfig({ NODE_ENV: 'production', REALTIME_URL: 'https://temple.account.workers.dev/', NEXT_PUBLIC_REALTIME_URL: 'wss://old.account.workers.dev' }, browser))
      .toEqual({ configured: true, url: 'wss://temple.account.workers.dev', reason: null });
    expect(realtimeRoomConfig({ NODE_ENV: 'production', NEXT_PUBLIC_REALTIME_URL: 'wss://legacy.account.workers.dev' }, browser).url).toBe('wss://legacy.account.workers.dev');
  });
  it('defaults production to the deployed public Worker without returning unrelated secrets', () => {
    const config = realtimeRoomConfig({ NODE_ENV: 'production', NEON_REALTIME_URL: 'https://example.rt.aws.neon.tech/', NEON_REALTIME_SECRET: 'private-realtime-secret', DATABASE_URL: 'postgresql://private-user:private-password@database.invalid/db' }, browser);
    expect(config).toEqual({ configured: true, url: DEFAULT_REALTIME_URL, reason: null });
    expect(JSON.stringify(config)).not.toContain('private');
  });
  it('rejects local endpoints, SQL endpoints and secret-bearing or room-specific URLs in production', () => {
    for (const REALTIME_URL of ['ws://localhost:1999', 'wss://127.0.0.1:1999', 'wss://192.168.1.2:1999', 'https://example.rt.aws.neon.tech/', 'wss://user:secret@worker.workers.dev', 'wss://worker.workers.dev?secret=private', 'wss://worker.workers.dev/parties/temple/lotus-1']) {
      expect(realtimeRoomConfig({ NODE_ENV: 'production', REALTIME_URL }, browser)).toEqual({ configured: false, url: null, reason: 'invalid' });
    }
  });
  it('keeps the existing separate WebSocket server for local and LAN development only', () => {
    expect(realtimeRoomConfig({ NODE_ENV: 'development' }, { hostname: 'localhost', secure: false }).url).toBe('ws://localhost:1999');
    expect(realtimeRoomConfig({ NODE_ENV: 'development' }, { hostname: '192.168.1.8', secure: false }).url).toBe('ws://192.168.1.8:1999');
    expect(realtimeRoomConfig({ NODE_ENV: 'development' }, browser)).toEqual({ configured: false, url: null, reason: 'missing' });
    expect(realtimeRoomConfig({ NODE_ENV: 'production' }, { hostname: 'localhost', secure: false }).url).toBe(DEFAULT_REALTIME_URL);
  });
});
