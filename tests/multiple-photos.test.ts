import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { articlePhotoUnlocked, photoStyle } from '../lib/media';
import { readDatabaseArticles,writeDatabaseArticles } from '../lib/postgres-store';
import { photoPaths } from '../lib/article-format';
import { defaultProfile } from '../lib/profile';
import type { Article } from '../lib/article';

test('two paid photo results are saved separately and replayed without another request',async()=>{
 const db=new PGlite();
 type TestPool={query:(sql:string,values?:unknown[])=>Promise<unknown>};
 const globals=globalThis as typeof globalThis & {adminPool?:TestPool;adminDatabaseReady?:Promise<void>};
 const fetchBefore=globalThis.fetch;const keyBefore=process.env.OPENAI_API_KEY;const databaseBefore=process.env.DATABASE_URL;
 let calls=0;
 try{
  for(const file of ['001-initial.sql','002-project-isolation.sql','003-content-workflow.sql'])await db.exec(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
  process.env.DATABASE_URL='postgresql://test:test@localhost/test';process.env.OPENAI_API_KEY='test-only-key';globals.adminDatabaseReady=Promise.resolve();
  globals.adminPool={query:async(sql,values)=>{const r=await db.query(sql,values);return {...r,rowCount:r.affectedRows};}};
  await db.query('INSERT INTO inspirovate.profile(id,payload) VALUES($1,$2)',['flowers',JSON.stringify(defaultProfile)]);
  const a:Article={id:'multi-photo-test',siteId:'flowers',revision:1,status:'draft',title:'Vase care',slug:'vase-care',description:'Care guide',body:'Intro\n\n## Cleaning\n\nUseful text\n\n## Drying\n\nMore text',coverImage:'/images/hero.webp',coverAlt:'Vase',publishedAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',format:{photoCount:2,externalLinkCount:0,internalLinkCount:0}};
  const older:Article={...a,id:'older-article',slug:'older',updatedAt:'2025-12-01T00:00:00Z',photos:[{path:'/images/old.webp',alt:'Cover illustration: Roses on a kitchen table'}]};
  const {format:_unused,...legacy}={...a,id:'legacy-draft',slug:'legacy'};void _unused;
  await writeDatabaseArticles([a,older,legacy as Article]);
  const buffers=await Promise.all(['#abcdef','#123456','#654321','#fedcba'].map(background=>sharp({create:{width:1536,height:1024,channels:3,background}}).webp().toBuffer()));
  const prompts:string[]=[];
  globalThis.fetch=async(input,init)=>{
   prompts.push(JSON.parse(String(init?.body)).prompt);
   assert.ok(String(input).startsWith('https://api.openai.com/v1/images/generations'));
   const bytes=buffers[calls++];assert.ok(bytes,'Unexpected extra paid request');
   return new Response(JSON.stringify({created:1,data:[{b64_json:bytes.toString('base64')}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const prepared=await articlePhotoUnlocked(a.id);
  assert.equal(calls,2);assert.equal(prepared.photos?.length,2);assert.equal(photoPaths(prepared).length,2);
  assert.ok(prepared.body.includes(prepared.photos![1].path));assert.equal(prepared.coverImage,prepared.photos![0].path);
  const replay=await articlePhotoUnlocked(a.id);assert.equal(calls,2);assert.equal(replay.body,prepared.body);
  const tasks=(await db.query('SELECT id FROM inspirovate.ai_tasks')).rows;assert.equal(tasks.length,2);
  assert.equal((await readDatabaseArticles())[0].photos?.length,2);
  const [cover,second]=[photoStyle(a.id,0),photoStyle(a.id,1)];
  assert.notDeepEqual(cover,second,'the supporting photo does not repeat the cover style');
  assert.ok(prompts[0].includes(cover.palette)&&prompts[1].includes(second.shot));
  assert.ok(prompts[0].includes('Roses on a kitchen table'),'recent photos on the website are listed to avoid');
  assert.ok(prompts[1].includes(prepared.photos![0].alt),'the second photo knows the cover');
  const upgraded=await articlePhotoUnlocked('legacy-draft');
  assert.equal(calls,4);assert.equal(upgraded.photos?.length,2,'a draft without a format follows the project setting, not one photo');
  assert.equal(upgraded.format?.photoCount,2);
 }finally{
  globalThis.fetch=fetchBefore;delete globals.adminPool;delete globals.adminDatabaseReady;
  if(keyBefore===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=keyBefore;
  if(databaseBefore===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=databaseBefore;
  await db.close();
 }
});
