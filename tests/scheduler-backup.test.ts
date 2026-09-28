import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('backup dispatch respects disabled projects, native freshness, credentials and deduplication', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA inspirovate; CREATE SCHEMA vault; CREATE SCHEMA net;
      CREATE TABLE inspirovate.projects(id text PRIMARY KEY,payload jsonb,archived_at timestamptz);
      CREATE TABLE inspirovate.schedules(id text PRIMARY KEY,payload jsonb);
      CREATE TABLE inspirovate.worker(last_trigger text,automatic_heartbeat timestamptz);
      CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
      CREATE TABLE net.requests(id bigserial,url text,headers jsonb,body jsonb);
      CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) RETURNS bigint
      LANGUAGE sql AS 'INSERT INTO net.requests(url,headers,body) VALUES($1,$2,$3) RETURNING id';
      INSERT INTO inspirovate.projects VALUES('flowers','{}',NULL);
      INSERT INTO inspirovate.schedules VALUES('flowers','{"enabled":true}');`);
    const sql = await readFile(new URL('../db/supabase-scheduler.sql',import.meta.url),'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.query("INSERT INTO inspirovate.scheduler_dispatch(repository) VALUES('List-In-Hive/inspirovate-admin-websites')");
    const dispatch = async () => (await db.query<{id:number|null}>('SELECT inspirovate.dispatch_scheduler() AS id')).rows[0].id;
    assert.equal(await dispatch(),null); // Explicit installation is required.
    await db.exec('UPDATE inspirovate.scheduler_dispatch SET enabled=true');
    await assert.rejects(dispatch(),/credential is missing/);
    await db.exec("INSERT INTO vault.decrypted_secrets VALUES('inspirovate_scheduler_github_token','test-only-token')");
    await db.exec("UPDATE inspirovate.schedules SET payload='{" + '"enabled":false' + "}'");
    assert.equal(await dispatch(),null);
    await db.exec("UPDATE inspirovate.schedules SET payload='{" + '"enabled":true' + "}'; UPDATE inspirovate.projects SET archived_at=now()");
    assert.equal(await dispatch(),null);
    await db.exec("UPDATE inspirovate.projects SET archived_at=NULL,payload='{" + '"localOnly":true' + "}'");
    assert.equal(await dispatch(),null);
    await db.exec("UPDATE inspirovate.projects SET payload='{}'; INSERT INTO inspirovate.worker VALUES('schedule',now())");
    assert.equal(await dispatch(),null); // Native cron gets priority.
    await db.exec("UPDATE inspirovate.worker SET automatic_heartbeat=now()-interval '54 minutes'");
    assert.equal(await dispatch(),null); // A recent hourly native check suppresses backup.
    await db.exec("UPDATE inspirovate.worker SET last_trigger='manual'");
    assert.equal(await dispatch(),1); // A manual check cannot mask the outage.
    assert.equal(await dispatch(),null); // Repeated invocation is throttled.
    const request = (await db.query<{url:string,body:unknown}>('SELECT url,body FROM net.requests')).rows[0];
    assert.equal(request.url,'https://api.github.com/repos/List-In-Hive/inspirovate-admin-websites/dispatches');
    assert.deepEqual(request.body,{event_type:'inspirovate-supabase-schedule'});
    await db.exec("UPDATE inspirovate.scheduler_dispatch SET last_requested_at=now()-interval '60 minutes'; UPDATE inspirovate.worker SET last_trigger='supabase'");
    assert.equal(await dispatch(),2); // Backup remains periodic while native cron is down.
    await db.exec("UPDATE inspirovate.scheduler_dispatch SET last_requested_at=now()-interval '60 minutes'; UPDATE inspirovate.worker SET last_trigger='schedule',automatic_heartbeat=now()-interval '60 minutes'");
    assert.equal(await dispatch(),3); // A missed native hour allows fallback.
    const publicExecute = (await db.query<{allowed:boolean}>("SELECT has_function_privilege('public','inspirovate.dispatch_scheduler()','EXECUTE') AS allowed")).rows[0];
    assert.equal(publicExecute.allowed,false);
  } finally { await db.close(); }
});
