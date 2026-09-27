import test from 'node:test';
import assert from 'node:assert/strict';
import { monthSlots,pacificToUTC,reviewDeadline } from '../lib/calendar';
import { processSlot } from '../lib/schedule-engine';
import type { Slot } from '../lib/schedule-store';
import type { Article } from '../lib/article';

test('four monthly dates stay at 08:00 Pacific across DST and leap years',()=>{
  const march=monthSlots('2026-03',4);
  assert.equal(march[0].publishAt,'2026-03-01T16:00:00.000Z');
  assert.equal(march[1].publishAt,'2026-03-08T15:00:00.000Z');
  for(const s of march)assert.equal(Date.parse(s.publishAt)-Date.parse(s.generateAt),86400000);
  assert.equal(monthSlots('2028-02',4)[3].publishAt,'2028-02-22T16:00:00.000Z');
  assert.throws(()=>pacificToUTC('2026-03-08T02:30'));
  assert.throws(()=>pacificToUTC('2026-11-01T01:30'));
});
function fixture(){
  const publishAt='2026-10-01T15:00:00.000Z';
  const slot:Slot={id:'slot',month:'2026-10',index:0,publishAt,generateAt:'2026-09-30T15:00:00.000Z',topic:'',custom:false,status:'planned',updatedAt:publishAt,revision:1};
  let now=Date.parse(slot.generateAt);let generated=0;let published=0;let verified=0;
  let article:Article|undefined;
  const d={now:()=>now,generate:async()=>{generated++;article={id:'draft',title:'Original',status:'draft',revision:1} as Article;return article;},article:async()=>article,persist:async()=>{},publish:async(a:Article)=>{published++;article={...a,commit:'abc',pushedAt:new Date(now).toISOString(),status:'deploying'};return article;},verify:async(a:Article)=>{verified++;article={...a,status:'published'};return article;}};
  return {slot,d,setNow:(n:number)=>{now=n;},edit:()=>{article!.title='Manual edit';article!.revision++;},counts:()=>({generated,published,verified}),article:()=>article};
}
test('scheduled article is generated 24h before and publishes latest edit without approval',async()=>{
  const f=fixture();const config={perMonth:4,enabled:true,latePolicy:'review24h' as const};
  await processSlot(f.slot,config,f.d);assert.equal(f.slot.status,'review');assert.equal(f.counts().published,0);
  f.edit();f.setNow(Date.parse(f.slot.publishAt));await processSlot(f.slot,config,f.d);
  assert.equal(f.slot.status,'published');assert.equal(f.article()?.title,'Manual edit');assert.equal(f.article()?.approvedHash,undefined);
  await processSlot(f.slot,config,f.d);assert.deepEqual(f.counts(),{generated:1,published:1,verified:1});
});
test('late generation preserves 24h review by default; immediate policy publishes when overdue',async()=>{
  const f=fixture();f.setNow(Date.parse(f.slot.publishAt)+3600000);
  await processSlot(f.slot,{perMonth:4,enabled:true,latePolicy:'review24h'},f.d);
  assert.equal(f.slot.publishAt,reviewDeadline('2026-10-01T15:00:00Z','2026-10-01T16:00:00Z'));assert.equal(f.counts().published,0);
  const g=fixture();g.setNow(Date.parse(g.slot.publishAt)+3600000);
  await processSlot(g.slot,{perMonth:4,enabled:true,latePolicy:'immediate'},g.d);assert.equal(g.counts().published,1);
});
test('generation failure never publishes and backs off',async()=>{
  const f=fixture();let calls=0;f.d.generate=async()=>{calls++;throw new Error('No credits');};
  await processSlot(f.slot,{perMonth:4,enabled:true,latePolicy:'immediate'},f.d);
  await processSlot(f.slot,{perMonth:4,enabled:true,latePolicy:'immediate'},f.d);
  assert.equal(calls,1);assert.equal(f.slot.status,'error');assert.equal(f.counts().published,0);
});


test('Publish now uses the latest draft, replaces a future date and updates its calendar only after a commit',async()=>{
 const {publishImmediately}=await import('../lib/publish-now');
 const calls:string[]=[];const now=Date.parse('2026-09-26T10:00:00Z');
 const draft={id:'now',siteId:'flowers',title:'Latest title',slug:'publish-now-test',description:'Description',body:'Latest manual changes',coverImage:'/images/hero.webp',coverAlt:'Flowers',status:'draft' as const,revision:7,publishedAt:'2026-10-20T15:00:00Z',updatedAt:'2026-09-26T09:00:00Z'};
 const ops={now:()=>now,save:async(a:typeof draft)=>{assert.equal(a.body,draft.body);assert.equal(a.revision,8);assert.equal(a.publishedAt,new Date(now).toISOString());calls.push('save');},approve:async(a:typeof draft)=>{calls.push('approve');return {...a,status:'approved' as const};},publish:async(a:import('../lib/article').Article)=>{calls.push('publish');return {...a,status:'deploying' as const,commit:'test-commit'};},completeSchedule:async(a:import('../lib/article').Article,when:string)=>{assert.equal(a.commit,'test-commit');assert.equal(when,new Date(now).toISOString());calls.push('schedule');}};
 await publishImmediately(draft,ops as Parameters<typeof publishImmediately>[1]);assert.deepEqual(calls,['save','approve','publish','schedule']);
 calls.length=0;
 await assert.rejects(()=>publishImmediately(draft,{...ops,publish:async()=>{throw new Error('Editorial blocker');}} as Parameters<typeof publishImmediately>[1]),/blocker/);assert.deepEqual(calls,['save','approve']);
 await assert.rejects(()=>publishImmediately({...draft,commit:'already'},ops as Parameters<typeof publishImmediately>[1]),/already/);
});
