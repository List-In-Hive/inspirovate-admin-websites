import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewThenPhotos } from '../lib/ai-service';
import type { Article } from '../lib/article';

test('a draft that needs attention still gets its photos before the issue is reported',async()=>{
 const article={id:'a1'} as Article;let photos=0;
 const review=(ready:boolean)=>async()=>({article,review:{output:{ready,remainingIssues:ready?[]:[{severity:'blocker' as const,category:'facts' as const,message:'Confirm the delivery claim.'}]}}}) as never;
 const deps=(ready:boolean)=>({review:review(ready),photos:async()=>{photos++;return {...article,photos:[{path:'/images/a.webp',alt:'A'}]} as Article;}});
 await assert.rejects(()=>reviewThenPhotos('a1',deps(false)),/Confirm the delivery claim/);
 assert.equal(photos,1);
 assert.equal((await reviewThenPhotos('a1',deps(true))).photos?.length,1);
 assert.equal(photos,2);
});
