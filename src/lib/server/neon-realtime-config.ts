export type NeonRealtimeConfig = { url: string; database: string; secret: string };

export class RealtimeConfigurationError extends Error {
  readonly code = 'NEON_REALTIME_NOT_CONFIGURED';
  constructor(readonly missing: readonly string[]) {
    super(`Neon Realtime needs valid ${missing.join(', ')}.`);
  }
}

/** No secret values are included in thrown errors. */
export function neonRealtimeConfig(env: Record<string, string | undefined>): NeonRealtimeConfig {
  const missing: string[] = [];
  const secret = env.NEON_REALTIME_SECRET?.trim();
  if (!secret) missing.push('NEON_REALTIME_SECRET');
  let endpoint: URL | undefined;
  try {
    endpoint = new URL(env.NEON_REALTIME_URL || '');
    const local = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1' || endpoint.hostname === '[::1]';
    if (endpoint.protocol === 'https:') endpoint.protocol = 'wss:';
    else if (endpoint.protocol === 'http:' && local) endpoint.protocol = 'ws:';
    if (endpoint.protocol !== 'wss:' && !(endpoint.protocol === 'ws:' && local)) throw new Error();
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
  } catch { endpoint = undefined; missing.push('NEON_REALTIME_URL'); }
  let database = env.NEON_REALTIME_DATABASE?.trim();
  if (!database) {
    try { database = decodeURIComponent(new URL(env.DATABASE_URL || env.NEON_KEY || '').pathname.slice(1)); } catch { /* handled below */ }
  }
  if (!database || database.includes('\0') || new TextEncoder().encode(database).length > 63) missing.push('NEON_REALTIME_DATABASE or DATABASE_URL/NEON_KEY');
  if (missing.length) throw new RealtimeConfigurationError(missing);
  return { url: endpoint!.href, database: database!, secret: secret! };
}
