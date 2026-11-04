import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { loadProfile, persistenceMode, saveProfile } from '@/lib/server/db';
import { allowRequest, hasValidOrigin, readSession, SESSION_AGE, SESSION_COOKIE, signSession } from '@/lib/server/session';
import { normalizeDisplayName } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bodySchema = z.object({ name: z.string().max(24).transform(normalizeDisplayName).pipe(z.string().min(1).max(24)), avatar: z.number().int().min(0).max(3) });

export async function GET(request: NextRequest) {
  try {
    const session = readSession(request);
    const player = session ? await loadProfile(session.id) || session : null;
    return NextResponse.json({ player, persistence: persistenceMode() });
  } catch {
    return NextResponse.json({ player: null, persistence: persistenceMode(), error: 'Không thể tải hồ sơ lúc này.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: 'Origin không hợp lệ.' }, { status: 403 });
  if (!allowRequest(`guest:${request.headers.get('x-forwarded-for')?.split(',')[0] || 'local'}`, 20)) return NextResponse.json({ error: 'Vui lòng thử lại sau một phút.' }, { status: 429 });
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Tên cần từ 1–24 ký tự và avatar hợp lệ.' }, { status: 400 });
    const existing = readSession(request);
    const profile = await saveProfile({ id: existing?.id || crypto.randomUUID(), name: parsed.data.name, avatar: parsed.data.avatar, merit: 0 });
    const response = NextResponse.json({ player: profile, persistence: persistenceMode() });
    response.cookies.set(SESSION_COOKIE, signSession(profile), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: SESSION_AGE, path: '/' });
    return response;
  } catch {
    return NextResponse.json({ error: 'Chưa thể lưu hồ sơ. Kiểm tra kết nối cơ sở dữ liệu hoặc SESSION_SECRET.' }, { status: 503 });
  }
}
