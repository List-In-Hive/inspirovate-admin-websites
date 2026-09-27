import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hostedRuntime } from './runtime';

export const sessionCookie = '__Host-inspirovate-session';
export const sessionSeconds = 8 * 60 * 60;
export class AccessError extends Error {
  constructor(message: string, public status = 401) { super(message); }
}
export function authSettings() {
  const password = process.env.ADMIN_PASSWORD || '';
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  const origin = process.env.ADMIN_ORIGIN || process.env.RENDER_EXTERNAL_URL || '';
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new AccessError('Hosted access is not configured.', 503); }
  if (password.length < 20 || secret.length < 32 || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new AccessError('Hosted access is not configured.', 503);
  }
  return { password, secret, origin: parsed.origin, host: parsed.host };
}
export function assertTrustedRequest(request: Request) {
  const host = request.headers.get('host');
  const expected = hostedRuntime() ? authSettings() : null;
  if (expected ? host !== expected.host : host !== '127.0.0.1:3100' && host !== 'localhost:3100') {
    throw new AccessError('Invalid request host.', 403);
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AccessError('Cross-site requests are not allowed.', 403);
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (request.headers.get('origin') !== (expected?.origin || `http://${host}`)) throw new AccessError('Invalid request origin.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AccessError('Expected JSON.', 415);
  }
}
function signature(payload: string) {
  const { password, secret } = authSettings();
  // Rotating either secret revokes all existing signed sessions.
  return createHmac('sha256', createHash('sha256').update(JSON.stringify([secret, password])).digest()).update(payload).digest('base64url');
}
export function passwordMatches(value: string) {
  return timingSafeEqual(createHash('sha256').update(value).digest(), createHash('sha256').update(authSettings().password).digest());
}
export function createSession(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ expires: now + sessionSeconds * 1000, nonce: randomBytes(24).toString('base64url') })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function validSession(token: string | undefined, now = Date.now()) {
  if (!token || token.length > 1024) return false;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || !/^[A-Za-z0-9_-]{43}$/.test(sig) || extra !== undefined) return false;
  const expected = signature(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.expires === 'number' && data.expires > now && data.expires <= now + sessionSeconds * 1000 && typeof data.nonce === 'string';
  } catch { return false; }
}
export function requestSession(request: Request) {
  return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
}
export function assertAdmin(request: Request) {
  assertTrustedRequest(request);
  if (hostedRuntime() && !validSession(requestSession(request))) throw new AccessError('Please sign in.');
}
export function sessionHeader(token: string, maxAge = sessionSeconds) {
  return `${sessionCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
