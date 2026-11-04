import { NextResponse } from 'next/server';
import { realtimeRoomConfig } from '@/lib/realtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requested = new URL(request.url);
  // Host retains the browser-facing address when Next runs behind a development proxy.
  let hostname = requested.hostname;
  try { hostname = new URL(`${requested.protocol}//${request.headers.get('host') || requested.host}`).hostname; } catch { /* Use the parsed request URL. */ }
  const config = realtimeRoomConfig(process.env, { hostname, secure: requested.protocol === 'https:' });
  return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
