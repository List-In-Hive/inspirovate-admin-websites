import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateDraft, availableSlug } from '../lib/generation';
import { defaultProfile } from '../lib/profile';
import type { Article } from '../lib/article';
import type { Generation } from '../lib/postgres-store';
import { automaticTopic, AUTOMATIC_TOPIC } from '../lib/automatic-content';
import { profileSchema } from '../lib/profile';

function fixture() {
  const jobs = new Map<string, Generation>(); const articles: Article[] = [];
  let calls = 0;
  const input = { id: randomUUID(), topic: 'Choosing flowers for a small desk', coverImage: '/images/hero.webp', coverAlt: 'Flowers' };
  const deps = {
    model: 'test-model', read: async (id: string) => structuredClone(jobs.get(id)),
    write: async (g: Generation) => { jobs.set(g.id, structuredClone(g)); },
    articles: async () => articles, profile: async () => defaultProfile, titles: async () => ['Existing article'],
    generate: async () => { calls++; return { output: { title: 'Desk flowers', slug: 'desk-flowers', description: 'A thoughtful arrangement.', body: '## Choosing flowers\nUseful draft text.' }, inputTokens: 123, outputTokens: 456, responseId: 'response-test' }; },
    save: async (value: unknown, id: string) => {
      const a = { ...(value as Article), id, siteId: 'flowers', status: 'draft', revision: 1, updatedAt: new Date().toISOString() } as Article;
      articles.push(a); return a;
    },
  };
  return { deps, input, jobs, articles, calls: () => calls };
}
test('AI creates an unapproved draft, records usage and replays without another paid request', async () => {
  const f=fixture(); const first=await generateDraft(f.input,f.deps);
  const second=await generateDraft(f.input,f.deps);
  assert.equal(first.id,second.id); assert.equal(f.calls(),1); assert.equal(f.articles.length,1);
  assert.equal(first.slug,'desk-flowers');assert.equal(first.status,'draft'); assert.equal(first.approvedHash,undefined);
  assert.equal(f.jobs.get(f.input.id)?.inputTokens,123);
  await assert.rejects(()=>generateDraft({...f.input,topic:'Different topic'},f.deps),/different topic/);
});
test('saved AI output survives a draft-storage failure and retry does not pay again', async () => {
  const f=fixture();const save=f.deps.save;f.deps.save=async()=>{throw new Error('Temporary storage failure');};
  await assert.rejects(()=>generateDraft(f.input,f.deps));
  assert.ok(f.jobs.get(f.input.id)?.output);f.deps.save=save;
  await generateDraft(f.input,f.deps);assert.equal(f.calls(),1);assert.equal(f.articles.length,1);
});
test('failure after creating draft is reconciled by deterministic ID without duplicate article', async () => {
  const f=fixture();const write=f.deps.write;
  f.deps.write=async job=>{if(job.status==='succeeded')throw new Error('Network failure');await write(job);};
  await assert.rejects(()=>generateDraft(f.input,f.deps));assert.equal(f.articles.length,1);
  f.deps.write=write;await generateDraft(f.input,f.deps);
  assert.equal(f.calls(),1);assert.equal(f.articles.length,1);
});
test('an ambiguous OpenAI timeout never automatically retries the same request', async () => {
  const f=fixture();let calls=0;f.deps.generate=async()=>{calls++;throw new Error('Timeout');};
  await assert.rejects(()=>generateDraft(f.input,f.deps));
  await assert.rejects(()=>generateDraft(f.input,f.deps),/already sent/);assert.equal(calls,1);
});

test('article URLs are descriptive without random IDs, and collisions use the first free number',()=>{
 assert.equal(availableSlug('flowers-for-early-autumn-changing-light',[]),'flowers-for-early-autumn-changing-light');
 assert.equal(availableSlug('flowers',['flowers','flowers-2']),'flowers-3');
 assert.ok(availableSlug('a'.repeat(100),['a'.repeat(100)]).length<=100);
});

test('automatic generation needs no topic and safely replays after project strategy changes',async()=>{
 const f=fixture();const {topic:ignored,...request}=f.input;void ignored;
 const supplied=profileSchema.parse({...defaultProfile,goals:'Help readers choose suitable office flowers',contentAreas:'Small spaces, vase choices, desk arrangements',editorialRules:'No delivery claims or holiday campaigns'});
 f.deps.profile=async()=>supplied;
 const generate=f.deps.generate;let received='';
 const deps={...f.deps,generate:async(topic:string,profile:typeof defaultProfile)=>{received=topic;assert.deepEqual(profile,supplied);return generate();}};
 const first=await generateDraft(request,deps);
 assert.equal(received,AUTOMATIC_TOPIC);
 assert.equal(f.jobs.get(request.id)?.topic,AUTOMATIC_TOPIC);
 deps.profile=async()=>({...supplied,goals:'Changed strategy for future articles'});
 assert.equal((await generateDraft(request,deps)).id,first.id);assert.equal(f.calls(),1);
 assert.equal(automaticTopic(),AUTOMATIC_TOPIC);
 assert.ok(automaticTopic('2027-04-01T15:00:00Z').includes('2027-04-01T15:00:00Z'));
});

test('existing project profiles gain reusable strategy defaults without losing facts',()=>{
 const legacy={name:'Other business',facts:'Existing verified facts',audience:'Existing audience',tone:'Existing tone'};
 const profile=profileSchema.parse(legacy);
 assert.equal(profile.facts,legacy.facts);assert.equal(profile.name,legacy.name);
 assert.ok(profile.goals);assert.ok(profile.contentAreas);assert.ok(profile.editorialRules);
 assert.equal(profileSchema.parse(profile).contentAreas,profile.contentAreas);
 assert.throws(()=>profileSchema.parse({...profile,goals:''}));
});
