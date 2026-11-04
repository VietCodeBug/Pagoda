import { NextResponse, type NextRequest } from 'next/server';
import { readSession } from '@/lib/server/session';
import { loadGameProgress } from '@/lib/server/game-progress';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: 'Hãy vào game trước.' }, { status: 401 });
  try { return NextResponse.json(await loadGameProgress(session.id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Chưa thể tải bộ sưu tập.' }, { status: 503 }); }
}
