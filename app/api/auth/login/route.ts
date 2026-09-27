import { z } from 'zod';
import { assertTrustedRequest, createSession, passwordMatches, sessionHeader } from '@/lib/admin-auth';
import { allowLoginAttempt } from '@/lib/login-rate-limit';
import { failure, json, readBody } from '@/lib/http';
import { hostedRuntime } from '@/lib/runtime';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertTrustedRequest(request);
    if (!hostedRuntime()) return json({ message: 'Local mode does not require sign-in.' }, 400);
    const { password } = z.object({ password: z.string().min(1).max(256) }).parse(await readBody(request));
    if (!await allowLoginAttempt()) return Response.json({ message: 'Too many sign-in attempts. Please wait 15 minutes.' }, { status: 429, headers: { 'Retry-After': '900', 'Cache-Control': 'no-store' } });
    if (!passwordMatches(password)) return json({ message: 'Incorrect password.' }, 401);
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionHeader(createSession()), 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
