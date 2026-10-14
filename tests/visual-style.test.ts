import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { optimizePhoto, photoPrompt } from '../lib/media';
import { nearestAspect } from '../lib/article-format';
import { sampleAspect, styleSampleFiles, suggestVisualStyle } from '../lib/visual-style';
import { defaultProfile } from '../lib/profile';
import type { Article } from '../lib/article';

const article={id:'a1',siteId:'flowers',revision:1,status:'draft',title:'Courier checklist',slug:'courier-checklist',description:'What to prepare',body:'Intro\n\n## Pickup\n\nText',coverImage:'/images/hero.webp',coverAlt:'Hero',publishedAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',format:{photoCount:2,externalLinkCount:3,internalLinkCount:3}} as Article;

test('a website image style replaces the realistic photo defaults but keeps varied framing',()=>{
 const base={source:article,id:article.id,index:1,instruction:'',recent:[]};
 const realistic=photoPrompt({...base,profile:defaultProfile});
 assert.match(realistic,/editorial photograph/);assert.match(realistic,/"palette"/);assert.match(realistic,/"aspectRatio":"3:2"/);
 const styled=photoPrompt({...base,profile:{...defaultProfile,imageStyle:'Flat vector illustration, navy #111B2B and cream',imageAspect:'16:9'}});
 assert.doesNotMatch(styled,/editorial photograph/);assert.doesNotMatch(styled,/"palette"/);assert.doesNotMatch(styled,/"light"/);
 assert.match(styled,/"websiteStyle":"Flat vector illustration, navy #111B2B and cream"/);assert.match(styled,/"shot"/);assert.match(styled,/"aspectRatio":"16:9"/);
 assert.match(styled,/Follow websiteStyle exactly/);
});

test('photos are cropped to the website proportions',async()=>{
 const input=await sharp({create:{width:1536,height:1024,channels:3,background:'#336699'}}).webp().toBuffer();
 assert.deepEqual(await optimizePhoto(input,'16:9').then(p=>[p.width,p.height]),[1536,864]);
 assert.deepEqual(await optimizePhoto(input,'4:3').then(p=>[p.width,p.height]),[1365,1024]);
 assert.deepEqual(await optimizePhoto(input).then(p=>[p.width,p.height]),[1536,1024]);
 const square=await sharp({create:{width:1024,height:1024,channels:3,background:'#336699'}}).webp().toBuffer();
 assert.deepEqual(await optimizePhoto(square,'1:1').then(p=>[p.width,p.height]),[1024,1024]);
});

test('style samples prefer blog covers, skip logos and vote on proportions',()=>{
 const file=(path:string,size=20000)=>({path,sha:path,size,mode:'100644',type:'blob'});
 const snapshot={files:[file('public/logo.webp'),file('public/images/team.jpg'),file('public/images/tiny.webp',900),file('public/images/blog-b.webp'),file('public/images/blog-a.webp'),file('app/page.tsx')],
  texts:[{path:'content/blog/one.md',content:'---\ntitle: One\ncoverImage: "/images/blog-b.webp"\n---\nBody'}]};
 assert.deepEqual(styleSampleFiles(snapshot).map(f=>f.path),['public/images/blog-b.webp','public/images/blog-a.webp','public/images/team.jpg']);
 assert.equal(nearestAspect(1600,760),'16:9');assert.equal(nearestAspect(1200,1200),'1:1');assert.equal(nearestAspect(1536,1024),'3:2');
 assert.equal(sampleAspect([{width:1600,height:900},{width:1600,height:760},{width:1200,height:800}]),'16:9');
 assert.equal(sampleAspect([]),'3:2');
});

test('style detection sends the website images and returns a reviewable style',async()=>{
 const fetchBefore=globalThis.fetch;const keyBefore=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only-key';
 let body:{input:{content:unknown}[]}|undefined;
 try{
  globalThis.fetch=async(_input,init)=>{
   body=JSON.parse(String(init?.body));
   return new Response(JSON.stringify({id:'r',object:'response',status:'completed',output:[{type:'message',id:'m',role:'assistant',status:'completed',content:[{type:'output_text',annotations:[],text:JSON.stringify({imageStyle:'  Flat vector illustration, navy and cream  '})}]}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const jpeg=await sharp({create:{width:64,height:36,channels:3,background:'#111b2b'}}).jpeg().toBuffer();
  const result=await suggestVisualStyle([{path:'public/images/a.webp',width:1600,height:900,jpeg},{path:'public/images/b.webp',width:1600,height:760,jpeg}]);
  assert.deepEqual(result,{imageStyle:'Flat vector illustration, navy and cream',imageAspect:'16:9'});
  const images=(body!.input[1].content as {type:string}[]).filter(c=>c.type==='input_image');assert.equal(images.length,2);
  await assert.rejects(()=>suggestVisualStyle([]),/No suitable images/);
 }finally{globalThis.fetch=fetchBefore;if(keyBefore===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=keyBefore;}
});
