import { NextResponse, type NextRequest } from 'next/server';
import { sealPublicPrayers } from '@/lib/server/neon-realtime';
import { RealtimeConfigurationError } from '@/lib/server/neon-realtime-config';
import { allowRequest, hasValidOrigin } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: 'Origin không hợp lệ.' }, { status: 403, headers });
  const client = request.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
  if (!allowRequest(`prayer-live-query:${client}`, 120)) return NextResponse.json({ error: 'Vui lòng thử lại sau một phút.' }, { status: 429, headers });
  try {
    // Deliberately do not consume client query text, identity, filters or parameters.
    return NextResponse.json(await sealPublicPrayers(), { headers });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof RealtimeConfigurationError ? 'Sổ lời nguyện chưa bật cập nhật trực tiếp.' : 'Chưa thể kết nối sổ lời nguyện trực tiếp.',
      code: error instanceof RealtimeConfigurationError ? 'REALTIME_NOT_CONFIGURED' : 'REALTIME_UNAVAILABLE',
    }, { status: 503, headers });
  }
}
