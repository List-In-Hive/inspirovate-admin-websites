import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,mkdir,writeFile,symlink,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { githubRepository,publicWebsite } from '../lib/repository-input';
import { inspectRepository,addProject } from '../lib/project-onboarding';
import { selectedSourceFiles,redactRepositoryText,type RepositorySnapshot } from '../lib/github-source';
import { publicAddress } from '../lib/public-network';
import { repositoryPath,repositoryText } from '../lib/repository-files';
import { listProjects,projectById,updateProject,assertProjectReady } from '../lib/project-catalog';
import { profileSchema } from '../lib/profile';
const source={
 'package.json':'{"scripts":{"build":"next build && tsx scripts/publication-manifest.ts"}}',
 'README.md':'A practical furniture business website.',
 'app/blog/[slug]/page.tsx':'<article data-publication-hash={publicationHash(article)} />',
 'app/services/page.tsx':'Furniture services',
 'scripts/publication-manifest.ts':'writeFileSync("public/publication-manifest.json", data);',
 'content/blog/a-guide.md':'---\ntitle: A guide\nslug: a-guide\ndescription: Useful advice\npublishedAt: "2026-01-01T00:00:00Z"\nstatus: published\ncoverImage: /images/hero.webp\ncoverAlt: A chair\n---\n\nOriginal guide.'
};
function snapshot():RepositorySnapshot{return {repository:'owner/furniture',name:'furniture',description:'Furniture advice',homepage:'https://furniture.netlify.app',branch:'main',commit:'a'.repeat(40),truncated:false,files:[...Object.entries(source).map(([p,v])=>({path:p,sha:'a'.repeat(40),size:v.length,mode:'100644',type:'blob'})),{path:'public/images/hero.webp',sha:'b'.repeat(40),size:10000,mode:'100644',type:'blob'}],texts:Object.entries(source).map(([path,content])=>({path,content}))};}

test('onboarding accepts repository roots only; source selection excludes secrets, dependencies and symlinks',()=>{
 assert.equal(githubRepository('https://github.com/owner/furniture.git'),'owner/furniture');
 for(const u of ['http://github.com/owner/repo','https://github.com.evil.com/owner/repo','https://github.com/owner/repo/tree/main','https://user:pass@github.com/owner/repo','https://github.com/owner/repo?token=secret','file:///etc/passwd'])assert.throws(()=>githubRepository(u));
 for(const u of ['http://site.com','https://127.0.0.1','https://[::1]','https://localhost','https://site.com/path'])assert.throws(()=>publicWebsite(u));
 assert.equal(publicWebsite('https://furniture.netlify.app/'),'https://furniture.netlify.app');
 const s=snapshot();s.files.push(...['.env.local','node_modules/page.tsx','private-key.pem'].map(path=>({path,sha:'c',size:100,mode:'100644',type:'blob'})),{path:'app/about/page.tsx',sha:'d',size:100,mode:'120000',type:'blob'});
 const paths=selectedSourceFiles(s.files).map(f=>f.path);assert.ok(paths.includes('README.md'));assert.ok(!paths.includes('.env.local'));assert.ok(!paths.includes('app/about/page.tsx'));
 assert.ok(!redactRepositoryText('API_KEY="secretvalue"\n'+ 'sk-'+'x'.repeat(30)).includes('secretvalue'));
 assert.equal(publicAddress('127.0.0.1'),false);assert.equal(publicAddress('169.254.169.254'),false);assert.equal(publicAddress('::ffff:127.0.0.1'),false);assert.equal(publicAddress('8.8.8.8'),true);
});

test('compatibility is structural, conservative, and never inferred by AI',()=>{
 assert.equal(inspectRepository(snapshot()).compatible,true);
 const missing=snapshot();missing.texts=missing.texts.filter(f=>!f.path.includes('publication-manifest'));assert.equal(inspectRepository(missing).compatible,false);
 assert.equal(inspectRepository({...snapshot(),truncated:true}).compatible,false);
 assert.ok(inspectRepository(snapshot()).links.includes('/services'));
 const social=snapshot();social.homepage='';social.texts.push({path:'config/site.ts',content:'contact: "https://wa.me/12345", docs: "https://nextjs.org/docs"'});
 assert.equal(inspectRepository(social).url,'');
 social.texts.push({path:'netlify.toml',content:'SITE_URL = "https://furniture.netlify.app"'});assert.equal(inspectRepository(social).url,'https://furniture.netlify.app');
});

test('repository readers and writers reject symlink escapes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'repository-path-'));try{
  await mkdir(path.join(root,'content'));await writeFile(path.join(root,'content','ok.md'),'ok');await symlink(os.tmpdir(),path.join(root,'public'));
  assert.equal(await repositoryText(root,'content/ok.md'),'ok');
  await assert.rejects(()=>repositoryPath(root,'public/images/generated.webp'),/symbolic/);
  await assert.rejects(()=>repositoryPath(root,'../outside'),/Invalid/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('GitHub onboarding persists isolated setup, deduplicates paid analysis, pauses, removes and restores without losing content',async()=>{
 const db=new PGlite();const env=process.env.DATABASE_URL;
 type TestPool={query:(sql:string,values?:unknown[])=>Promise<unknown>;connect?:()=>Promise<unknown>};const globals=globalThis as typeof globalThis & {adminPool?:TestPool;adminDatabaseReady?:Promise<void>};
 try{
  for(const name of ['001-initial','002-project-isolation','003-content-workflow','004-project-catalog'])await db.exec(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../db/004-project-catalog.sql',import.meta.url),'utf8'));
  process.env.DATABASE_URL='postgresql://test:test@localhost/test';globals.adminDatabaseReady=Promise.resolve();globals.adminPool={query:async(sql,values)=>{const r=await db.query(sql,values);return {...r,rowCount:r.affectedRows};}};
  const dbQuery=globals.adminPool.query;
  globals.adminPool.connect=async()=>({query:async(sql:string,values?:unknown[])=>sql.includes('pg_try_advisory_lock')?{rows:[{locked:true}]}:sql.includes('pg_advisory_unlock')?{rows:[{}]}:dbQuery(sql,values),release:()=>{}});
  let paid=0;let reads=0;const deps={snapshot:async()=>{reads++;return snapshot();},infer:async()=>{paid++;return profileSchema.parse({name:'Furniture studio',facts:'Furniture advice',audience:'Homeowners',tone:'Practical'});}};
  const p=(await addProject({repositoryUrl:'https://github.com/owner/furniture'},deps))!;
  assert.equal(p.automationEnabled,false);assert.equal(p.setup?.reviewed,false);assert.equal(p.branch,'main');
  assert.equal((await db.query<{payload:{name:string}}>('SELECT payload FROM inspirovate.profile WHERE id=$1',[p.id])).rows[0].payload.name,'Furniture studio');
  assert.equal((await db.query('SELECT * FROM inspirovate.library WHERE site_id=$1',[p.id])).rows.length,1);
  assert.ok((await db.query<{payload:{enabled:boolean}}>('SELECT payload FROM inspirovate.knowledge WHERE site_id=$1',[p.id])).rows.every(r=>!r.payload.enabled));
  await assert.rejects(()=>updateProject(p.id,{action:'automation',enabled:true}),/Review/);
  await updateProject(p.id,{action:'review',url:p.url});assertProjectReady((await projectById(p.id))!);
  await updateProject(p.id,{action:'automation',enabled:true});assert.equal((await projectById(p.id))?.automationEnabled,true);
  await updateProject(p.id,{action:'automation',enabled:false});assert.equal((await projectById(p.id))?.automationEnabled,false);
  await updateProject(p.id,{action:'archive'});assert.equal(await projectById(p.id),undefined);assert.equal((await listProjects()).length,0);
  const {withProject}=await import('../lib/config');const {withLock}=await import('../lib/store');
  let mutated=false;await assert.rejects(()=>withProject(p,()=>withLock(async()=>{mutated=true;})),/removed/);assert.equal(mutated,false);
  const again=await addProject({repositoryUrl:'https://github.com/OWNER/FURNITURE'},deps);assert.equal(again?.id,p.id);assert.ok(again?.archivedAt);assert.equal(paid,1);assert.equal(reads,1);
  await assert.rejects(()=>updateProject(p.id,{action:'automation',enabled:true}),/Restore/);
  await updateProject(p.id,{action:'restore'});assert.equal((await projectById(p.id))?.automationEnabled,false);
  assert.equal((await db.query('SELECT * FROM inspirovate.library WHERE site_id=$1',[p.id])).rows.length,1);
  const failed=await addProject({repositoryUrl:'https://github.com/other/unsupported'},{snapshot:async()=>({...snapshot(),repository:'other/unsupported',name:'unsupported',texts:[]}),infer:async()=>{throw new Error('API timeout');}});
  assert.equal(failed?.setup?.compatible,false);assert.equal(failed?.automationEnabled,false);assert.ok(failed?.setup?.issues.some(i=>i.includes('AI setup')));
  await assert.rejects(()=>updateProject(failed!.id,{action:'review',url:p.url}),/integration/);
  assert.equal((await projectById(p.id))?.setup?.reviewed,true);
 }finally{if(env===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=env;delete globals.adminPool;delete globals.adminDatabaseReady;await db.close();}
});
