import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleSlots, cycleStarts, defaultSchedule, remainingIndexes, scheduleDefaults } from '../lib/calendar';
import { MAX_ATTEMPTS, planDueCycles, planReady, processSlot } from '../lib/schedule-engine';
import { NeedsAttentionError } from '../lib/errors';
import { workerTrigger } from '../lib/worker-status';
import { scheduleSchema, type Slot, type TopicPlan } from '../lib/schedule-store';
import type { Article } from '../lib/article';

const settings={...scheduleDefaults,cycleStartDay:14,timeZone:'Europe/London',publishHour:9};
test('each project cycle runs from its own start day with plan and batch preparation before it',()=>{
  const [current,next]=cycleStarts(new Date('2026-10-12T10:00:00Z'),settings);
  assert.equal(current.toFormat('yyyy-MM-dd'),'2026-09-14');assert.equal(next.toFormat('yyyy-MM-dd'),'2026-10-14');
  assert.equal(cycleStarts(new Date('2026-10-14T10:00:00Z'),settings)[0].toFormat('yyyy-MM-dd'),'2026-10-14');
  const cycle=cycleSlots(next,settings);
  assert.equal(cycle.key,'2026-10-14');
  assert.deepEqual(cycle.dates.map(d=>d.publishAt),['2026-10-14T08:00:00.000Z','2026-10-21T08:00:00.000Z','2026-10-29T09:00:00.000Z','2026-11-06T09:00:00.000Z']);
  assert.equal(cycle.planAt,'2026-10-03T23:00:00.000Z');
  for(const date of cycle.dates)assert.equal(date.generateAt,'2026-10-06T23:00:00.000Z');
  assert.ok(defaultSchedule(new Date('2026-01-31T20:00:00Z')).cycleStartDay<=28);
  assert.equal(scheduleSchema.parse({perMonth:4,enabled:true,latePolicy:'review24h'}).cycleStartDay,1,'legacy settings keep monthly cycles');
  assert.throws(()=>scheduleSchema.parse({...settings,timeZone:'Mars/Base'}));
  assert.throws(()=>scheduleSchema.parse({...settings,approvalDays:10,planLeadDays:10}));
});
test('drafts from an older monthly calendar take the nearest new dates',()=>{
  const dates=cycleSlots(cycleStarts(new Date('2026-10-02T10:00:00Z'),scheduleDefaults)[0],scheduleDefaults).dates;
  assert.deepEqual(remainingIndexes(dates,[dates[1].publishAt]),[0,2,3]);
  assert.deepEqual(remainingIndexes(dates,[]),[0,1,2,3]);
});

const plan:TopicPlan={readerQuestion:'How do I keep desk flowers fresh?',primaryKeyword:'keep desk flowers fresh',searchIntent:'informational',angle:'Small office routines'};
const slot=(index:number,extra:Partial<Slot>={}):Slot=>({id:`s${index}`,month:'2026-10-14',index,publishAt:`2026-10-${14+index*7}T08:00:00.000Z`,generateAt:'2026-10-06T23:00:00.000Z',planAt:'2026-10-03T23:00:00.000Z',topic:'',custom:false,status:'planned',updatedAt:'',revision:0,...extra});
test('one paid request plans a whole cycle; topics wait for approval or the review window',async()=>{
  const all=[slot(0),slot(1),slot(2,{topic:'A topic a person wrote',planStatus:'approved'})];let calls=0;const persisted:string[]=[];
  let now=Date.parse('2026-10-04T00:00:00Z');
  const ops={now:()=>now,persist:async(s:Slot)=>{persisted.push(`${s.id}:${s.planStatus}`);},plan:async(cycle:Slot[])=>{calls++;assert.equal(cycle.length,2);return cycle.map((_,i)=>({...plan,primaryKeyword:`${plan.primaryKeyword} ${i}`}));}};
  assert.equal(await planDueCycles(all,{enabled:true,approvalDays:3},ops),true);
  assert.equal(calls,1);assert.deepEqual(persisted.slice(0,2),['s0:planning','s1:planning'],'slots are marked before paying');
  assert.equal(all[0].planStatus,'proposed');assert.ok(all[0].topic.includes('keep desk flowers fresh 0'));assert.equal(all[2].topic,'A topic a person wrote');
  assert.equal(await planDueCycles(all,{enabled:true,approvalDays:3},ops),false,'a planned cycle is never paid for again');
  assert.equal(planReady(all[0],now),false);now=Date.parse(all[0].planApproveAt!);assert.equal(planReady(all[0],now),true);
  const failing=[slot(0)];
  await planDueCycles(failing,{enabled:true,approvalDays:3},{...ops,plan:async()=>{throw new Error('Quota');}});
  assert.equal(failing[0].planStatus,'failed');assert.ok(planReady(failing[0],now),'writing falls back to automatic topic selection');
  const stuck=[slot(0,{planStatus:'planning',planStartedAt:'2026-10-03T00:00:00Z'})];
  await planDueCycles(stuck,{enabled:true,approvalDays:3},ops);assert.equal(stuck[0].planStatus,'failed');
});
function publishing(){
  const s=slot(0,{articleId:'a',status:'review',publishAt:'2026-10-14T08:00:00.000Z'});
  let article={id:'a',revision:3,status:'draft'} as Article;let publishes=0;
  const d={now:()=>Date.parse('2026-10-14T09:00:00Z'),generate:async()=>article,article:async()=>article,persist:async()=>{},
    publish:async(a:Article)=>{publishes++;article={...a,revision:a.revision+1};throw new NeedsAttentionError('Editorial review found unresolved issues.',article.revision);},verify:async(a:Article)=>a};
  return {s,d,edit:()=>{article={...article,revision:article.revision+1};},publishes:()=>publishes};
}
test('editorial blockers wait for a person instead of failing every hour',async()=>{
  const f=publishing();const config={enabled:true,latePolicy:'review24h' as const};
  await processSlot(f.s,config,f.d);assert.equal(f.s.status,'attention');assert.equal(f.s.retryAfter,undefined);
  await processSlot(f.s,config,f.d);assert.equal(f.publishes(),1,'no retry without a new revision');
  f.edit();await processSlot(f.s,config,f.d);assert.equal(f.publishes(),2,'a saved edit is retried');
});
test('other failures back off and stop after the attempt limit',async()=>{
  const s=slot(0,{generateAt:'2026-10-01T00:00:00Z',planStatus:'approved'});let now=Date.parse('2026-10-07T00:00:00Z');let calls=0;
  const d={now:()=>now,generate:async()=>{calls++;throw new Error('Temporary outage');},article:async()=>undefined,persist:async()=>{},publish:async(a:Article)=>a,verify:async(a:Article)=>a};
  const gaps:number[]=[];
  for(let i=0;i<MAX_ATTEMPTS+2;i++){await processSlot(s,{enabled:true,latePolicy:'review24h'},d);if(s.retryAfter){gaps.push((Date.parse(s.retryAfter)-now)/3600000);now=Date.parse(s.retryAfter);}else now+=86400000;}
  assert.equal(calls,MAX_ATTEMPTS);assert.deepEqual(gaps,[1,3,6,12]);assert.ok(s.error?.includes('stopped'));
});
test('the always-on worker counts as automatic scheduling',()=>{
  assert.equal(workerTrigger({INSPIROVATE_WORKER:'true'}),'worker');
  assert.equal(workerTrigger({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'schedule'}),'schedule');
});
