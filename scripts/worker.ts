// Always-on scheduler (Railway or any container host). GitHub Actions remains a safe backup:
// project locks make overlapping runs skip each other.
process.env.INSPIROVATE_WORKER = 'true';
const concurrency = Math.max(1, Math.min(20, Number(process.env.WORKER_CONCURRENCY || 3)));
const interval = Math.max(15, Number(process.env.WORKER_INTERVAL_SECONDS || 60)) * 1000;
process.env.DATABASE_POOL_MAX ||= String(concurrency + 2);

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; console.log(`Received ${signal}; stopping after the current pass.`); });
const pause = async (ms: number) => { const until = Date.now() + ms; while (!stopping && Date.now() < until) await new Promise(r => setTimeout(r, 1000)); };

async function main() {
  const missing = ['DATABASE_URL', 'OPENAI_API_KEY', 'GITHUB_PROJECTS_TOKEN'].filter(key => !process.env[key]?.trim());
  if (missing.length) { console.error(`Missing worker configuration: ${missing.join(', ')}. Secret values are never printed.`); process.exitCode = 1; return; }
  const { initializeDatabase, closeDatabase } = await import('../lib/database');
  const { schedulerTick } = await import('../lib/scheduler');
  await initializeDatabase();
  console.log(`Worker started: ${concurrency} projects in parallel, a pass every ${interval / 1000} s.`);
  try {
    while (!stopping) {
      const started = Date.now();
      try { await schedulerTick({ concurrency }); }
      catch (e) { console.error((e as Error).message); }
      await pause(interval - (Date.now() - started));
    }
  } finally { await closeDatabase(); }
}
void main().catch(e => { console.error(`The worker stopped: ${(e as Error).message}`); process.exitCode = 1; });
