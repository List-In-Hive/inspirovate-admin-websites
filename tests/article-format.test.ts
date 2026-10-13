import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSchema, linkProblems, markdownAssets, placePhotos, photoPaths } from '../lib/article-format';
import { contentIssues } from '../lib/editorial';
const format=formatSchema.parse({});
test('counts include reference links and autolinks, exclude images and code, and normalize same-site URLs',()=>{
 const body='[One](/about) [Again](https://site.test/about#top) [Two][two] <https://source.test/a>\n\n[two]: /contact\n\n![Photo](/images/a.webp)\n\n`[fake](https://evil.test)`';
 assert.equal(markdownAssets(body).images.length,1);
 assert.deepEqual(linkProblems(body,['/about','/contact','https://source.test/a'],'https://site.test',{...format,internalLinkCount:2,externalLinkCount:1}),[]);
 assert.ok(linkProblems('[Invented](https://evil.test)',[],'https://site.test',format).some(e=>e.includes('Unverified')));
 assert.ok(linkProblems('[One](/about) [Duplicate](/about)',['/about'],'https://site.test',{...format,internalLinkCount:2,externalLinkCount:0}).some(e=>e.includes('found 1')));
 assert.deepEqual(linkProblems('No links.',[],'https://site.test',{...format,internalLinkCount:0,externalLinkCount:0}),[]);
});
test('supporting photos survive re-layout without duplication and cover counts once',()=>{
 const photos=[{path:'/images/cover.webp',alt:'Cover'},{path:'/images/detail.webp',alt:'Detail'}];
 const first=placePhotos('Intro\n\n## One\n\nText\n\n## Two\n\nMore',photos);
 assert.equal(placePhotos(first,photos),first);
 assert.deepEqual(photoPaths({coverImage:photos[0].path,body:first}),photos.map(p=>p.path));
 assert.equal(markdownAssets(first).images.length,1);
 const changed=placePhotos(first,[photos[0],{path:'/images/new.webp',alt:'New'}]);
 assert.ok(!changed.includes('detail.webp'));assert.ok(changed.includes('new.webp'));
});
test('editorial gate blocks shortages and unknown sources while accepting managed photos',()=>{
 const a={title:'Article',slug:'article',description:'Description',body:'word '.repeat(450)+'[Page](/flowers) [Source](https://source.test/a)\n\n![Detail](/images/detail.webp)',photos:[{path:'/images/detail.webp',alt:'Detail'}],sources:[{url:'https://source.test/a',title:'Source'}],format:{...format,internalLinkCount:1,externalLinkCount:1}};
 assert.deepEqual(contentIssues(a,['/flowers']),[]);
 assert.ok(contentIssues({...a,sources:[]},['/flowers']).some(i=>i.message.includes('Unverified')));
 assert.ok(contentIssues({...a,format},['/flowers']).some(i=>i.message.includes('Expected 3')));
});

test('DOI encoded separators match the same retrieved source without broad URL decoding',()=>{
 assert.deepEqual(linkProblems('[Study](https://doi.org/10.3390/beverages4030068)',['https://doi.org/10.3390%2Fbeverages4030068'],'https://site.test'),[]);
 assert.ok(linkProblems('[Other](https://other.test/a/b)',['https://other.test/a%2Fb'],'https://site.test').length);
});

import {articleWordCount,editorialText,removeUnknownInternalLinks,photoDescription} from '../lib/article-format';
import {editorialHash} from '../lib/editorial';
test('registered photos do not invalidate prose review, but edits and unregistered images do',()=>{
 const photos=[{path:'/images/cover.webp',alt:'Cover'},{path:'/images/detail.webp',alt:'Detail'}];
 const article={title:'Title',slug:'title',description:'Description',body:'Intro.\n\n## Heading\n\nUseful text.',photos};
 const illustrated={...article,body:placePhotos(article.body,photos)};
 assert.equal(editorialHash(article),editorialHash(illustrated));
 assert.equal(editorialText(illustrated.body,photos),article.body);
 assert.notEqual(editorialHash(article),editorialHash({...illustrated,body:illustrated.body+' Changed advice.'}));
 assert.notEqual(editorialHash(article),editorialHash({...illustrated,body:illustrated.body+'\n\n![Unmanaged](/other.webp)'}));
});
test('word counts include reader text and headings, excluding photos, URLs and Markdown markers',()=>{
 assert.equal(articleWordCount('## Two words\n\n[Three more words](https://long.example/path)\n\n![Many image words](/photo.webp)'),5);
 const a={title:'Title',slug:'title',description:'Description',format:{photoCount:2,internalLinkCount:0,externalLinkCount:0},body:'word '.repeat(651)};
 assert.ok(contentIssues(a,[]).some(i=>i.severity==='blocker'&&i.message.includes('651')));
 assert.ok(!contentIssues({...a,body:'word '.repeat(650)},[]).length);
});
test('editorial input removes draft links, preserves anchor text and allowed links',()=>{
 const result=removeUnknownInternalLinks('[Draft](/blog/draft) [Known](/about) [Remote](https://source.test) [Reference][r]\n\n[r]: https://site.test/blog/draft',['/about'],'https://site.test');
 assert.ok(result.startsWith('Draft [Known](/about) [Remote](https://source.test) Reference'));
 assert.deepEqual(markdownAssets(result).links,['/about','https://source.test']);
 assert.notEqual(photoDescription('Coffee','## Storing beans',0),photoDescription('Coffee','## Storing beans',1));
 assert.match(photoDescription('Coffee','## Storing beans',1),/Storing beans/);
});
