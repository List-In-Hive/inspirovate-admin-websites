import test from 'node:test';
import assert from 'node:assert/strict';
import {withDatabaseLock,query,projectLockKey} from '../lib/database';

function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
// Model session-scoped PostgreSQL ownership, including the shared legacy gate.
function lockPool(){
 const owners=new Map<string,{exclusive?:number;shared:Set<number>}>();let next=0;
 const releases:{id:number;destroyed:boolean}[]=[];
 return {owners,releases,connect:async()=>{
  const id=++next;
  return {query:async(sql:string,values?:unknown[])=>{
   if(sql==='SELECT session_id')return {rows:[{id}]};
   const key=sql.includes('3101')?`project:${values?.[0]}`:'gate';
   const state=owners.get(key)||{shared:new Set<number>()};owners.set(key,state);
   const shared=sql.includes('_shared');
   if(sql.includes('pg_try_advisory_lock')){
    const locked=shared?state.exclusive===undefined:state.exclusive===undefined&&state.shared.size===0;
    if(locked){if(shared)state.shared.add(id);else state.exclusive=id;}
    return {rows:[{locked}]};
   }
   if(sql.includes('pg_advisory_unlock')){if(shared)state.shared.delete(id);else if(state.exclusive===id)delete state.exclusive;return {rows:[{unlocked:true}]};}
   throw new Error('Unexpected SQL: '+sql);
  },release:(destroyed=false)=>{releases.push({id,destroyed});if(destroyed)for(const state of owners.values()){state.shared.delete(id);if(state.exclusive===id)delete state.exclusive;}}};
 }};
}
async function usingPool(run:()=>Promise<void>){
 const globals=globalThis as typeof globalThis & {adminPool?:unknown;adminDatabaseReady?:Promise<void>};
 const oldUrl=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://test:test@localhost/test';
 const before=globals.adminPool,ready=globals.adminDatabaseReady;const pool=lockPool();globals.adminPool=pool;globals.adminDatabaseReady=Promise.resolve();
 try{await run();assert.ok([...pool.owners.values()].every(s=>s.exclusive===undefined&&s.shared.size===0));assert.ok(pool.releases.length);}
 finally{globals.adminPool=before;globals.adminDatabaseReady=ready;if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;}
}
test('different projects run concurrently with independent database sessions',async()=>usingPool(async()=>{
 const firstEntered=deferred(),secondEntered=deferred(),finish=deferred();
 const first=withDatabaseLock(async()=>{firstEntered.resolve();await finish.promise;return (await query('SELECT session_id')).rows[0].id;},'flowers');
 const second=withDatabaseLock(async()=>{secondEntered.resolve();await finish.promise;return (await query('SELECT session_id')).rows[0].id;},'coffee');
 try{await Promise.all([firstEntered.promise,secondEntered.promise]);}finally{finish.resolve();}
 const ids=await Promise.all([first,second]);assert.notEqual(ids[0],ids[1]);
}));
test('same project rejects duplicate work and excludes removal; other projects can still work',async()=>usingPool(async()=>{
 const entered=deferred(),finish=deferred();let duplicateCalls=0;
 const running=withDatabaseLock(async()=>{entered.resolve();await finish.promise;},'flowers');
 await entered.promise;
 try{
  await assert.rejects(()=>withDatabaseLock(async()=>{duplicateCalls++;},'flowers'),/for this project/);
  await assert.rejects(()=>withDatabaseLock(async()=>{}),/catalog change/i);
  assert.equal(await withDatabaseLock(async()=>42,'coffee'),42);assert.equal(duplicateCalls,0);
 }finally{finish.resolve();await running;}
 assert.equal(await withDatabaseLock(async()=>7,'flowers'),7);
}));
test('legacy/catalog exclusive lock excludes project work; failures release ownership',async()=>usingPool(async()=>{
 const entered=deferred(),finish=deferred();
 const running=withDatabaseLock(async()=>{entered.resolve();await finish.promise;});await entered.promise;
 try{await assert.rejects(()=>withDatabaseLock(async()=>{},'coffee'),/older server operation/);}finally{finish.resolve();await running;}
 await assert.rejects(()=>withDatabaseLock(async()=>{throw new Error('operation failed');},'coffee'),/operation failed/);
 assert.equal(await withDatabaseLock(async()=>true,'coffee'),true);
 assert.equal(projectLockKey('flowers'),projectLockKey('flowers'));assert.notEqual(projectLockKey('flowers'),projectLockKey('coffee'));
}));
