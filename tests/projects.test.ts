import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projects } from '../lib/projects';

test('project context isolates overlapping async requests and local article operations',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'inspirovate-projects-'));
  process.env.ADMIN_DATA_DIR=dir;
  delete process.env.DATABASE_URL;
  const {withProject,getSite}=await import('../lib/config');
  const {readArticles,writeArticles}=await import('../lib/store');
  const {saveArticle,actOnArticle}=await import('../lib/service');
  projects.push({...projects[0],id:'test-project',name:'Test project',brand:'Test brand',repository:'test/other',url:'https://other.example'});
  try {
    assert.throws(()=>withProject('missing',()=>getSite()),/not found/);
    const contexts=await Promise.all(['flowers','test-project'].map(id=>withProject(id,async()=>{await new Promise(resolve=>setTimeout(resolve,id==='flowers'?10:1));return getSite();})));
    assert.deepEqual(contexts.map(p=>p.id),['flowers','test-project']);
    assert.notEqual(contexts[0].repository,contexts[1].repository);
    const input={title:'Test',slug:'same-slug',description:'Description',publishedAt:'2026-10-01T00:00:00Z',coverImage:'/images/hero.webp',coverAlt:'Flowers',body:'Draft content'};
    const article={...input,id:'flowers-article',siteId:'flowers',status:'draft' as const,revision:1,updatedAt:'2026-09-26T00:00:00Z'};
    await withProject('flowers',()=>writeArticles([article]));
    await withProject('test-project',async()=>{
      assert.deepEqual(await readArticles(),[]);
      await assert.rejects(()=>saveArticle({...article,body:'Changed'},article.id),/not found/);
      await assert.rejects(()=>actOnArticle(article.id,'approve',1),/not found/);
      await assert.rejects(()=>writeArticles([article]),/another project/);
      await writeArticles([{...article,id:'other-article',siteId:'test-project'}]);
    });
    assert.deepEqual(await withProject('flowers',()=>readArticles()),[article]);
    assert.equal((await withProject('test-project',()=>readArticles()))[0].id,'other-article');
    assert.equal(JSON.parse(await readFile(path.join(dir,'articles.json'),'utf8')).length,2);
  }finally{projects.pop();await rm(dir,{recursive:true,force:true});}
});

test('database reads and writes scope articles, AI history, profiles and calendars to the selected project',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  const {withProject}=await import('../lib/config');
  const store=await import('../lib/postgres-store');
  const calendar=await import('../lib/schedule-store');
  type TestPool={query:(sql:string,values?:unknown[])=>Promise<unknown>};
  const globals=globalThis as typeof globalThis & {adminPool?:TestPool;adminDatabaseReady?:Promise<void>};
  projects.push({...projects[0],id:'test-project',brand:'Test brand'});
  try {
    await db.exec(await readFile(new URL('../db/001-initial.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../db/002-project-isolation.sql',import.meta.url),'utf8'));
    process.env.DATABASE_URL='postgresql://test:test@localhost/test';
    globals.adminDatabaseReady=Promise.resolve();
    globals.adminPool={query:async(sql,values)=>{const result=await db.query(sql,values);return {...result,rowCount:result.affectedRows};}};
    const stamp='2026-10-01T15:00:00Z';
    const a={id:'flowers-a',siteId:'flowers',title:'Original',slug:'shared-slug',description:'Description',publishedAt:stamp,coverImage:'/images/hero.webp',coverAlt:'Flowers',body:'Original body',status:'draft' as const,revision:1,updatedAt:stamp};
    const g={id:'00000000-0000-4000-8000-000000000001',topic:'Original topic',coverImage:a.coverImage,coverAlt:a.coverAlt,model:'test',status:'succeeded' as const,createdAt:stamp};
    const slot={id:'00000000-0000-4000-8000-000000000002',month:'2026-10',index:0,publishAt:stamp,generateAt:stamp,topic:'Original',custom:true,status:'planned' as const,updatedAt:stamp,revision:0};
    await db.query("INSERT INTO inspirovate.profile(id,payload) VALUES ('flowers',$1),('test-project',$2)",[JSON.stringify({name:'Flowers',facts:'Flower business',audience:'Readers',tone:'Clear'}),JSON.stringify({name:'Other',facts:'Other business',audience:'Readers',tone:'Clear'})]);
    await db.query("INSERT INTO inspirovate.schedules(id,payload) VALUES ('test-project',$1)",[JSON.stringify({perMonth:8,enabled:false,latePolicy:'review24h'})]);
    await withProject('flowers',async()=>{await store.writeDatabaseArticles([a]);await store.writeGeneration(g);await calendar.writeSlot({...slot});});
    await withProject('test-project',async()=>{
      assert.deepEqual(await store.readDatabaseArticles(),[]);
      assert.deepEqual(await store.readGenerations(),[]);
      assert.equal(await store.readGeneration(g.id),undefined);
      assert.deepEqual(await calendar.slots(),[]);
      assert.equal((await store.readProfile()).name,'Other');
      assert.equal((await calendar.settings()).perMonth,8);
      await assert.rejects(()=>store.writeDatabaseArticles([{...a,siteId:'test-project',body:'Attempt'}]),/another project/);
      await assert.rejects(()=>store.writeGeneration({...g,topic:'Attempt'}),/another project/);
      await assert.rejects(()=>calendar.writeSlot({...slot,topic:'Attempt'}),/another project/);
      await assert.rejects(()=>calendar.updateSlot(slot.id,{revision:1,localTime:'2030-10-01T08:00',topic:'Attempt'}),/not found/);
      await store.writeDatabaseArticles([{...a,id:'other-a',siteId:'test-project'}]);
      await store.writeProfile({name:'Other updated',facts:'Other facts',audience:'Readers',tone:'Clear'});
    });
    await withProject('flowers',async()=>{
      assert.deepEqual(await store.readDatabaseArticles(),[a]);
      assert.equal((await store.readGeneration(g.id))?.topic,g.topic);
      assert.equal((await calendar.slots())[0].topic,slot.topic);
      assert.equal((await store.readProfile()).name,'Flowers');
      assert.equal((await calendar.settings()).perMonth,4);
      // One frequency setting keeps extending the calendar through a full year.
      for(let month=1;month<=12;month++)await calendar.ensureCalendar(false,new Date(`2030-${String(month).padStart(2,'0')}-01T08:00:00Z`));
      const year=(await calendar.slots()).filter(s=>s.month.startsWith('2030-'));
      assert.equal(year.length,48);assert.equal(new Set(year.map(s=>s.id)).size,48);
      assert.ok(year.every(s=>s.topic===''));
      assert.ok((await calendar.slots()).some(s=>s.month==='2031-01'));
      assert.equal((await calendar.slots()).find(s=>s.id===slot.id)?.topic,slot.topic);
    });
  }finally{projects.pop();delete globals.adminPool;delete globals.adminDatabaseReady;delete process.env.DATABASE_URL;await db.close();}
});
