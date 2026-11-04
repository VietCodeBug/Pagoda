import realtimeDefault from './realtime-default.json';

export type PublicRealtimeConfig = {
  configured: boolean;
  url: string | null;
  reason: 'missing' | 'invalid' | null;
};

// Public game service, not a credential. Runtime env can point a fork at another Worker.
export const DEFAULT_REALTIME_URL = realtimeDefault.url;

export function isLocalRealtimeHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '[::1]' || host === '::1' || host === '0.0.0.0'
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

/** Only a public room-server origin leaves the server, never an environment object. */
export function realtimeRoomConfig(
  env: Record<string, string | undefined>,
  request: { hostname: string; secure: boolean },
): PublicRealtimeConfig {
  const production = env.NODE_ENV === 'production';
  // Index access intentionally keeps the legacy alias a runtime server read.
  const configured = env['REALTIME_URL']?.trim() || env['NEXT_PUBLIC_REALTIME_URL']?.trim();
  if (!configured) {
    if (production) return { configured: true, url: DEFAULT_REALTIME_URL, reason: null };
    if (!production && isLocalRealtimeHost(request.hostname)) {
      const host = request.hostname === '0.0.0.0' ? 'localhost' : request.hostname;
      return { configured: true, url: `${request.secure ? 'wss' : 'ws'}://${host}:1999`, reason: null };
    }
    return { configured: false, url: null, reason: 'missing' };
  }
  try {
    const endpoint = new URL(configured);
    const local = isLocalRealtimeHost(endpoint.hostname);
    if (endpoint.protocol === 'https:') endpoint.protocol = 'wss:';
    else if (endpoint.protocol === 'http:' && !production && local) endpoint.protocol = 'ws:';
    const validProtocol = endpoint.protocol === 'wss:' || (!production && local && endpoint.protocol === 'ws:');
    const neonService = endpoint.hostname.endsWith('.neon.tech') || endpoint.hostname === 'neon.tech';
    if (!validProtocol || (production && local) || neonService || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error();
    return { configured: true, url: endpoint.origin, reason: null };
  } catch {
    return { configured: false, url: null, reason: 'invalid' };
  }
}
