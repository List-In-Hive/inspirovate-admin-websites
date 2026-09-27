import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const port = process.env.PORT || '3100';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error('PORT must be a valid port number.');
}
const missing = ['DATABASE_URL', 'OPENAI_API_KEY', 'GITHUB_PROJECTS_TOKEN'].filter(key => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing server configuration: ${missing.join(', ')}`);
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', port], {
  stdio: 'inherit', env: { ...process.env, ADMIN_HOSTED: 'true' },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('error', () => { console.error('The admin server could not start.'); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 1; });
