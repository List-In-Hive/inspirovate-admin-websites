import { assertTrustedRequest, sessionHeader } from '@/lib/admin-auth';
import { failure } from '@/lib/http';
export async function POST(request: Request) {
  try {
    assertTrustedRequest(request);
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionHeader('', 0), 'Cache-Control': 'no-store' } });
  } catch (e) { return failure(e); }
}
