import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const port = process.env.PORT || '3100';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error('PORT must be a valid port number.');
}
const missing = ['DATABASE_URL', 'OPENAI_API_KEY', 'GITHUB_PROJECTS_TOKEN', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET'].filter(key => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing server configuration: ${missing.join(', ')}`);
if (process.env.ADMIN_PASSWORD.length < 20 || process.env.ADMIN_SESSION_SECRET.length < 32) throw new Error('ADMIN_PASSWORD needs at least 20 characters and ADMIN_SESSION_SECRET needs at least 32.');
const domain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
const configuredOrigin = process.env.ADMIN_ORIGIN || (domain ? `https://${domain}` : '');
if (!configuredOrigin) throw new Error('The admin has no public address. On Railway: Settings → Networking → Generate Domain, then redeploy; or set ADMIN_ORIGIN for a custom domain.');
let origin;
try { origin = new URL(configuredOrigin); } catch { throw new Error('ADMIN_ORIGIN must be a full HTTPS address such as https://admin.example.com.'); }
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Configure an HTTPS ADMIN_ORIGIN, or generate a Railway public domain.');
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', port], {
  stdio: 'inherit', env: { ...process.env, ADMIN_HOSTED: 'true' },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('error', () => { console.error('The admin server could not start.'); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 1; });
