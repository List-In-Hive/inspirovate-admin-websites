import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { connectionOptions } from '../lib/database';

test('Supabase connections enforce TLS verification and session pooling', () => {
  const config=connectionOptions('postgresql://postgres.example:password@example.supabase.com:5432/postgres?sslmode=no-verify');
  assert.equal(config.ssl.rejectUnauthorized,true);assert.ok(!config.connectionString.includes('sslmode'));
  assert.throws(()=>connectionOptions('postgresql://u:pass@example.com:6543/postgres'));
  assert.throws(()=>connectionOptions('not a URL'));
});
test('Postgres schema is repeatable, private and preserves publication metadata on updates', async () => {
  const db=new PGlite();
  try {
    const sql=await readFile(new URL('../db/001-initial.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    const payload={id:'article-1',slug:'my-flowers',revision:8,status:'published',commit:'a'.repeat(40),approvedHash:'hash',updatedAt:'2026-09-26T00:00:00Z'};
    await db.query('INSERT INTO inspirovate.articles(id,slug,payload) VALUES ($1,$2,$3)',[payload.id,payload.slug,JSON.stringify(payload)]);
    const isolation=await readFile(new URL('../db/002-project-isolation.sql',import.meta.url),'utf8');
    await db.exec(isolation);await db.exec(sql);await db.exec(isolation);
    assert.equal((await db.query<{site_id:string}>('SELECT site_id FROM inspirovate.articles')).rows[0].site_id,'flowers');
    await db.query('INSERT INTO inspirovate.articles(id,site_id,slug,payload) VALUES ($1,$2,$3,$4)',['second-article','other-project',payload.slug,'{}']);
    const conflict=await db.query("INSERT INTO inspirovate.articles(id,site_id,slug,payload) VALUES ('article-1','other-project','changed','{}') ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,payload=excluded.payload WHERE inspirovate.articles.site_id=excluded.site_id RETURNING id");
    assert.equal(conflict.rows.length,0);
    await db.query("INSERT INTO inspirovate.profile(id,payload) VALUES ('other-project','{}')");
    const result=await db.query<{payload:typeof payload}>("SELECT payload FROM inspirovate.articles WHERE site_id='flowers'");
    assert.deepEqual(result.rows[0].payload,payload);
    await assert.rejects(()=>db.query('INSERT INTO inspirovate.articles(id,slug,payload) VALUES ($1,$2,$3)',['other',payload.slug,'{}']),/unique/);
    const policy=await db.query<{relrowsecurity:boolean}>("SELECT relrowsecurity FROM pg_class WHERE oid='inspirovate.articles'::regclass");
    assert.equal(policy.rows[0].relrowsecurity,true);
    const access=await db.query<{nspacl:string[]}>("SELECT nspacl FROM pg_namespace WHERE nspname='inspirovate'");
    assert.ok(!access.rows[0].nspacl.some(a=>a.startsWith('=')));
  } finally { await db.close(); }
});
