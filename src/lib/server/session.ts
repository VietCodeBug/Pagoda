import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { GuestProfile } from './db';
import { z } from 'zod';
import { normalizeDisplayName } from '../validation';

export const SESSION_COOKIE = 'vto_guest';
export const SESSION_AGE = 60 * 60 * 24 * 30;
type Session = GuestProfile & { expires: number };
const sessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(24).refine((name) => normalizeDisplayName(name) === name),
  avatar: z.number().int().min(0).max(3),
  expires: z.number().finite(),
});

function secret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must contain at least 32 characters in production');
  return createHash('sha256').update(`vto-development-only:${process.env.DATABASE_URL || process.env.NEON_KEY || process.cwd()}`).digest('hex');
}
export function signSession(profile: GuestProfile) {
  const payload = Buffer.from(JSON.stringify({ ...profile, expires: Date.now() + SESSION_AGE * 1000 } satisfies Session)).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
export function readSession(request: NextRequest): GuestProfile | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [payload, signature] = parts;
  try {
    const expected = createHmac('sha256', secret()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const parsed = sessionSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
    if (!parsed.success || parsed.data.expires <= Date.now()) return null;
    const value = parsed.data;
    return { id: value.id, name: value.name, avatar: value.avatar, merit: 0 };
  } catch { return null; }
}
export function hasValidOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    // Next may construct request.url with its bind address (0.0.0.0) in
    // development or an internal proxy host in production. Host is the
    // browser-facing authority and cannot be set by browser JavaScript.
    const parsed = new URL(origin);
    const host = request.headers.get('host') || new URL(request.url).host;
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === origin && parsed.host === host;
  } catch { return false; }
}

const recentRequests = new Map<string, number[]>();
export function allowRequest(key: string, limit: number, period = 60_000): boolean {
  const now = Date.now();
  const recent = (recentRequests.get(key) || []).filter((at) => now - at < period);
  if (recent.length >= limit) return false;
  recent.push(now); recentRequests.set(key, recent);
  if (recentRequests.size > 5000) for (const [id, times] of recentRequests) if (!times.some((at) => now - at < period)) recentRequests.delete(id);
  return true;
}
