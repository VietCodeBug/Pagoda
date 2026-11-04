import { NextResponse, type NextRequest } from 'next/server';
import { readSession } from '@/lib/server/session';
import { loadGameProgress } from '@/lib/server/game-progress';
import { signGameToken } from '@/lib/game-signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: 'Hãy vào game bằng hồ sơ khách trước.' }, { status: 401 });
  try {
    const secret = process.env.GAME_REWARD_SECRET || process.env.SESSION_SECRET || '';
    const ticket = await signGameToken(secret, { kind: 'session', profileId: session.id, expiresAt: Date.now() + 15 * 60_000 });
    const progress = await loadGameProgress(session.id);
    return NextResponse.json({ ticket, progress }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Chưa thể kết nối sổ thành tích. Hãy kiểm tra cấu hình game và migration.' }, { status: 503 });
  }
}
