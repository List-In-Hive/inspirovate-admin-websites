import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { connectionOptions } from '../lib/database';

async function main() {
// Invoked once from the protected GitHub environment; never exports secrets to logs.
const action = process.env.SCHEDULER_SETUP_ACTION || 'check';
const repository = process.env.GITHUB_REPOSITORY || '';
const token = process.env.PROJECTS_GITHUB_TOKEN || '';
let stage = 'configuration';
let client: pg.Client | undefined;
try {
  if (!['check','install','disable'].includes(action)) throw new Error('Invalid action');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository');
  if (action !== 'disable') {
    if (!token.trim()) throw new Error('Missing token');
    stage = 'GitHub dispatch permission';
    // This event has no matching workflow and performs no blog operations.
    const probe = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json',
        'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
      body: JSON.stringify({event_type:'inspirovate-scheduler-permission-check'}),
    });
    if (probe.status !== 204) throw new Error('GitHub dispatch rejected');
    console.log('GitHub accepted the permission probe. No blog workflow was triggered.');
  }
  stage = 'database connection';
  client = new pg.Client(connectionOptions(process.env.DATABASE_URL || ''));
  await client.connect();
  if (action === 'check') {
    const extensions = await client.query("SELECT name,installed_version FROM pg_available_extensions WHERE name IN ('pg_cron','pg_net','supabase_vault')");
    console.log('Available infrastructure:', extensions.rows);
    if (extensions.rowCount !== 3) throw new Error('Missing extension');
    console.log('Preflight passed. No configuration or secrets were stored in Supabase.');
  } else {
    stage = 'infrastructure configuration';
    await client.query('BEGIN');
    if (action === 'disable') {
      await client.query('UPDATE inspirovate.scheduler_dispatch SET enabled=false WHERE id');
      await client.query("SELECT cron.alter_job(jobid,active:=false) FROM cron.job WHERE jobname='inspirovate-blog-dispatch'");
      console.log('Supabase backup dispatch disabled.');
    } else {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_cron');
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_net');
      await client.query(await readFile(new URL('../db/supabase-scheduler.sql',import.meta.url),'utf8'));
      // Bind parameters keep credentials out of SQL text and cron history.
      const existing = await client.query("SELECT id FROM vault.secrets WHERE name='inspirovate_scheduler_github_token'");
      if (existing.rowCount) await client.query('SELECT vault.update_secret($1,$2)',[existing.rows[0].id,token]);
      else await client.query("SELECT vault.create_secret($1,'inspirovate_scheduler_github_token','GitHub scheduler backup dispatch')",[token]);
      await client.query(`INSERT INTO inspirovate.scheduler_dispatch(id,enabled,repository) VALUES(true,true,$1)
        ON CONFLICT(id) DO UPDATE SET enabled=true,repository=excluded.repository`,[repository]);
      await client.query("SELECT cron.schedule('inspirovate-blog-dispatch','21 * * * *','SELECT inspirovate.dispatch_scheduler();')");
      await client.query("SELECT cron.alter_job(jobid,active:=true) FROM cron.job WHERE jobname='inspirovate-blog-dispatch'");
      console.log('Supabase backup installed. The next cron tick will dispatch if native scheduling is stale.');
    }
    await client.query('COMMIT');
  }
} catch {
  if (client) await client.query('ROLLBACK').catch(()=>{});
  console.error(`Scheduler setup failed during ${stage}. For GitHub dispatch, the token must include this admin repository with Contents write permission. No secret values are logged.`);
  process.exitCode=1;
} finally { await client?.end(); }

}
void main().catch(() => { console.error("Scheduler setup could not complete."); process.exitCode=1; });
