import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createPrayer, listPrayers, persistenceMode } from '@/lib/server/db';
import { allowRequest, hasValidOrigin, readSession } from '@/lib/server/session';
import { normalizeMessage } from '@/lib/validation';
import { listPublicPrayersViaDataApi } from '@/lib/server/data-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ text: z.string().max(500).transform(normalizeMessage).pipe(z.string().min(1).max(500)), isPublic: z.boolean().default(false) });
export async function GET() {
  try {
    const prayers = await listPublicPrayersViaDataApi() ?? (await listPrayers()).map(({ id, name, text, createdAt }) => ({ id, name, text, createdAt }));
    return NextResponse.json({ prayers, persistence: persistenceMode() });
  } catch { return NextResponse.json({ prayers: [], error: 'Không tải được bảng lời nguyện.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: 'Origin không hợp lệ.' }, { status: 403 });
  const player = readSession(request);
  if (!player) return NextResponse.json({ error: 'Hãy vào chùa trước khi viết lời nguyện.' }, { status: 401 });
  if (!allowRequest(`prayer:${player.id}`, 4)) return NextResponse.json({ error: 'Hãy chờ trước khi viết tiếp.' }, { status: 429 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Lời nguyện cần từ 1–500 ký tự.' }, { status: 400 });
    const prayer = await createPrayer(player, parsed.data.text, parsed.data.isPublic);
    if (!prayer) return NextResponse.json({ error: 'Mỗi lời nguyện cách nhau ít nhất 30 giây.' }, { status: 429 });
    return NextResponse.json({ prayer: { id: prayer.id, text: prayer.text, isPublic: prayer.isPublic, createdAt: prayer.createdAt }, persistence: persistenceMode() }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Không thể lưu lời nguyện lúc này.' }, { status: 503 }); }
}
