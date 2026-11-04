import { NextResponse, type NextRequest } from 'next/server';
import { allowRequest, hasValidOrigin, readSession } from '@/lib/server/session';
import { claimGameReward } from '@/lib/server/game-progress';
import { isGameReward, type GameRewardTicket } from '@/lib/game-progress';
import { verifyGameToken } from '@/lib/game-signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: 'Origin không hợp lệ.' }, { status: 403 });
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: 'Hãy vào game trước.' }, { status: 401 });
  if (!allowRequest(`game-claim:${session.id}`, 60)) return NextResponse.json({ error: 'Đang lưu quá nhanh. Hãy thử lại.' }, { status: 429 });
  try {
    const body = await request.json();
    if (typeof body?.receipt !== 'string' || body.receipt.length > 10_000) return NextResponse.json({ error: 'Phần thưởng không hợp lệ.' }, { status: 400 });
    const ticket = await verifyGameToken<GameRewardTicket>(process.env.GAME_REWARD_SECRET || process.env.SESSION_SECRET || '', body.receipt);
    if (!ticket || ticket.kind !== 'reward' || ticket.profileId !== session.id || !Number.isFinite(ticket.expiresAt)
      || ticket.expiresAt < Date.now() || ticket.expiresAt > Date.now() + 20 * 60_000 || !isGameReward(ticket.reward)) {
      return NextResponse.json({ error: 'Phần thưởng hết hạn hoặc không thuộc hồ sơ này.' }, { status: 403 });
    }
    return NextResponse.json(await claimGameReward(session.id, ticket.reward), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Chưa thể lưu phần thưởng. Vui lòng thử lại.' }, { status: 503 }); }
}
