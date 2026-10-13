import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { withProject } from '../lib/config';
import { ensureCalendar, slots, updateSettings, writeSlot, type Slot } from '../lib/schedule-store';

test('switching a monthly calendar to cycles keeps drafts and does not double-book dates',async()=>{
 const db=new PGlite();
 type TestPool={query:(sql:string,values?:unknown[])=>Promise<unknown>};
 const globals=globalThis as typeof globalThis & {adminPool?:TestPool;adminDatabaseReady?:Promise<void>};
 const databaseBefore=process.env.DATABASE_URL;
 try{
  for(const file of ['001-initial.sql','002-project-isolation.sql'])await db.exec(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
  process.env.DATABASE_URL='postgresql://test:test@localhost/test';globals.adminDatabaseReady=Promise.resolve();
  globals.adminPool={query:async(sql,values)=>{const r=await db.query(sql,values);return {...r,rowCount:r.affectedRows};}};
  await withProject('flowers',async()=>{
   const now=new Date('2026-10-02T12:00:00Z');
   const legacy=(index:number,publishAt:string,extra:Partial<Slot>={}):Slot=>({id:`00000000-0000-4000-8000-00000000000${index}`,month:'2026-10',index,publishAt,generateAt:publishAt,topic:'',custom:false,status:'planned',updatedAt:'',revision:0,...extra});
   await writeSlot(legacy(1,'2026-10-08T15:00:00.000Z',{articleId:'draft',status:'review'}));
   await writeSlot(legacy(2,'2026-10-16T15:00:00.000Z'));
   await ensureCalendar(false,now);
   const october=(await slots()).filter(s=>s.publishAt.startsWith('2026-10'));
   assert.equal(october.filter(s=>s.month==='2026-10').length,1,'the planned legacy slot is replaced, the draft is kept');
   assert.equal(october.filter(s=>s.month==='2026-10-01').length,2,'two of four October dates remain after the past date and the draft');
   assert.ok(!october.some(s=>s.month==='2026-10-01'&&s.publishAt.startsWith('2026-10-08')),'the draft keeps its date to itself');
   assert.equal((await slots()).filter(s=>s.month==='2026-11-01').length,4);
   await ensureCalendar(false,now);assert.equal((await slots()).length,7,'calendar creation is repeatable');
   await updateSettings({perMonth:2,enabled:false,latePolicy:'review24h',cycleStartDay:14,timeZone:'Europe/London',publishHour:9,planLeadDays:10,approvalDays:3});
   const after=await slots();
   assert.ok(after.some(s=>s.articleId==='draft'),'drafts survive a schedule change');
   assert.ok(after.filter(s=>!s.articleId).every(s=>s.month.endsWith('-14')),'unstarted slots move to the new cycle');
  });
 }finally{
  delete globals.adminPool;delete globals.adminDatabaseReady;
  if(databaseBefore===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=databaseBefore;
 }
});
