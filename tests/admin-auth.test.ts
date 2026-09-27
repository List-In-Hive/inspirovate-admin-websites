import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertAdmin, assertTrustedRequest, createSession, validSession, passwordMatches, sessionHeader, sessionCookie } from '../lib/admin-auth';

test('hosted API requires a signed session and exact host/origin; tampering, expiry and password rotation revoke access', () => {
  const keys=['ADMIN_HOSTED','ADMIN_ORIGIN','ADMIN_PASSWORD','ADMIN_SESSION_SECRET'] as const;
  const previous=keys.map(key=>process.env[key]);
  try {
    Object.assign(process.env,{ADMIN_HOSTED:'true',ADMIN_ORIGIN:'https://admin.example.org',ADMIN_PASSWORD:'test-password-with-24-characters',ADMIN_SESSION_SECRET:'test-session-secret-with-32-characters'});
    const request=(cookie='',host='admin.example.org',origin='https://admin.example.org',method='POST')=>new Request('https://admin.example.org/api/projects',{method,headers:{host,origin,'content-type':'application/json',cookie}});
    assert.throws(()=>assertAdmin(request()),/sign in/);
    assert.throws(()=>assertAdmin(request('','127.0.0.1:3100')),/host/);
    assert.throws(()=>assertTrustedRequest(request('','admin.example.org','https://evil.example.org')),/origin/);
    const token=createSession();const cookie=`${sessionCookie}=${token}`;
    assert.doesNotThrow(()=>assertAdmin(request(cookie)));
    assert.doesNotThrow(()=>assertAdmin(request(cookie,'admin.example.org','', 'GET')));
    assert.equal(passwordMatches(process.env.ADMIN_PASSWORD!),true);
    assert.equal(passwordMatches('incorrect'),false);
    assert.equal(validSession(token+'tamper'),false);
    assert.equal(validSession(token.split('.')[0]+'.'+'é'.repeat(43)),false);
    assert.equal(validSession(createSession(Date.now()-9*60*60*1000)),false);
    assert.match(sessionHeader(token),/HttpOnly; Secure; SameSite=Strict/);
    assert.match(sessionHeader('',0),/Max-Age=0/);
    process.env.ADMIN_PASSWORD+='-rotated';assert.equal(validSession(token),false);
    delete process.env.ADMIN_PASSWORD;assert.throws(()=>assertAdmin(request(cookie)),/not configured/);
  } finally { keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];}); }
});

test('login attempt budget persists in Postgres and resets after the window',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  const old=process.env.DATABASE_URL;
  const globals=globalThis as typeof globalThis & {adminPool?:unknown;adminDatabaseReady?:Promise<void>};
  try {
    await db.exec("CREATE SCHEMA inspirovate; CREATE ROLE anon; CREATE ROLE authenticated;");
    await db.exec(await readFile(new URL('../db/005-admin-login.sql',import.meta.url),'utf8'));
    process.env.DATABASE_URL='postgresql://test:test@localhost/test';globals.adminDatabaseReady=Promise.resolve();
    globals.adminPool={query:async(sql:string,values?:unknown[])=>db.query(sql,values)};
    const {allowLoginAttempt}=await import('../lib/login-rate-limit');
    for(let i=0;i<10;i++)assert.equal(await allowLoginAttempt(),true);
    assert.equal(await allowLoginAttempt(),false);
    await db.exec("UPDATE inspirovate.login_attempts SET started_at=now()-interval '16 minutes'");
    assert.equal(await allowLoginAttempt(),true);
  }finally{delete globals.adminPool;delete globals.adminDatabaseReady;if(old===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=old;await db.close();}
});
