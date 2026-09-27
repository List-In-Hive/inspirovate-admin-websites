import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { automaticWorkerActive, heartbeatSql, workerTrigger } from '../lib/worker-status';

test('only a real schedule event verifies automatic scheduling; manual and local checks cannot refresh it', async () => {
  assert.equal(workerTrigger({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'schedule'}),'schedule');
  assert.equal(workerTrigger({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch'}),'manual');
  assert.equal(workerTrigger({GITHUB_EVENT_NAME:'schedule'}),'local');
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA inspirovate; CREATE TABLE inspirovate.worker(id text PRIMARY KEY,heartbeat timestamptz NOT NULL);');
    await db.query("INSERT INTO inspirovate.worker VALUES('flowers',now())");
    const migration = await readFile(new URL('../db/006-worker-trigger.sql',import.meta.url),'utf8');
    await db.exec(migration); await db.exec(migration);
    const worker = async () => (await db.query<{automatic_heartbeat:Date|null,last_trigger:string|null}>('SELECT automatic_heartbeat,last_trigger FROM inspirovate.worker WHERE id=$1',['flowers'])).rows[0];
    assert.equal(automaticWorkerActive((await worker()).automatic_heartbeat),false);
    await db.query(heartbeatSql,['flowers','manual']);
    assert.equal((await worker()).automatic_heartbeat,null);
    await db.query(heartbeatSql,['flowers','schedule']);
    const stamp = (await worker()).automatic_heartbeat!;
    assert.equal(automaticWorkerActive(stamp,stamp.getTime()+60000),true);
    await db.query(heartbeatSql,['flowers','manual']);
    assert.deepEqual((await worker()).automatic_heartbeat,stamp);
    assert.equal(automaticWorkerActive((await worker()).automatic_heartbeat,stamp.getTime()+21*60000),false);
    await db.query(heartbeatSql,['flowers','local']);
    assert.deepEqual((await worker()).automatic_heartbeat,stamp);
    assert.equal(automaticWorkerActive(stamp,stamp.getTime()-1),false);
    assert.equal(automaticWorkerActive('invalid'),false);
  } finally {await db.close();}
});
