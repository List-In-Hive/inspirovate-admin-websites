import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const sql=(file:string)=>readFile(new URL('../db/'+file,import.meta.url),'utf8');
test('status-only updates add no versions; old duplicate snapshots are removed once',async()=>{
 const db=new PGlite();
 for(const file of ['001-initial.sql','002-project-isolation.sql','003-content-workflow.sql'])await db.exec(await sql(file));
 const base={id:'a',siteId:'flowers',title:'Title',slug:'title',description:'D',body:'Body',status:'draft',revision:1};
 const save=(payload:object)=>db.query('UPDATE inspirovate.articles SET payload=$1 WHERE id=$2',[JSON.stringify(payload),'a']);
 await db.query('INSERT INTO inspirovate.articles(id,site_id,slug,payload) VALUES($1,$2,$3,$4)',['a','flowers','title',JSON.stringify(base)]);
 // The old trigger recorded every hourly retry.
 for(let r=2;r<=6;r++)await save({...base,revision:r,status:'failed',error:`Attempt ${r}`});
 await save({...base,revision:7,body:'Edited body'});
 await save({...base,revision:8,body:'Edited body',status:'failed',error:'Again'});
 const count=async()=>Number((await db.query<{n:number}>('SELECT count(*)::int n FROM inspirovate.article_history')).rows[0].n);
 assert.equal(await count(),8);
 const migration=await sql('007-history-content.sql');
 await db.exec(migration);
 const kept=(await db.query<{revision:number}>('SELECT revision FROM inspirovate.article_history ORDER BY id')).rows.map(r=>r.revision);
 assert.deepEqual(kept,[1,7],'one snapshot per distinct text');
 await save({...base,revision:9,body:'Edited body',status:'approved'});
 assert.equal(await count(),2,'a status change is not a new version');
 await save({...base,revision:10,body:'Second edit'});
 assert.equal(await count(),3,'a text change is');
 await db.exec(await sql('003-content-workflow.sql'));await db.exec(migration);
 await save({...base,revision:11,body:'Second edit',status:'published'});
 assert.equal(await count(),3,'re-running migrations on startup keeps content-only versions and does not prune again');
});
