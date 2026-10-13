import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { blogSettingsSchema, defaultBlogSettings, saveBlogSettingsSql, saveProfileSql } from '../lib/blog-settings';
import { defaultProfile, profileSchema } from '../lib/profile';

test('review settings persist per project without entering the active AI profile', async()=>{
  const defaults=defaultBlogSettings(defaultProfile);
  assert.deepEqual([defaults.photoCount,defaults.externalLinkCount,defaults.internalLinkCount],[2,3,3]);
  for(const patch of [{photoCount:0},{photoCount:7},{photoCount:1.5},{internalLinkCount:-1},{externalLinkCount:11}]) {
    assert.equal(blogSettingsSchema.safeParse({...defaults,...patch}).success,false);
  }
  const db=new PGlite();
  try{
    await db.exec('CREATE SCHEMA inspirovate; CREATE TABLE inspirovate.profile(id text PRIMARY KEY,payload jsonb NOT NULL);');
    for(const id of ['flowers','coffee'])await db.query('INSERT INTO inspirovate.profile VALUES($1,$2)',[id,JSON.stringify(defaultProfile)]);
    const draft={...defaults,photoCount:4,internalLinkCount:0};
    await db.query(saveBlogSettingsSql,[JSON.stringify(draft),'flowers']);
    const read=async(id:string)=>(await db.query<{payload:Record<string,unknown>}>('SELECT payload FROM inspirovate.profile WHERE id=$1',[id])).rows[0].payload;
    assert.deepEqual((await read('flowers')).blogSettingsDraft,draft);
    assert.equal((await read('coffee')).blogSettingsDraft,undefined);
    assert.equal('blogSettingsDraft' in profileSchema.parse(await read('flowers')),false);
    await db.query(saveProfileSql,[JSON.stringify({...defaultProfile,tone:'Updated active tone'}),'flowers']);
    assert.deepEqual((await read('flowers')).blogSettingsDraft,draft);
    assert.equal((await read('flowers')).tone,'Updated active tone');
  }finally{await db.close();}
});
