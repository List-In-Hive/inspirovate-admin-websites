import { assertPublicWebsiteNetwork } from './public-network';
import { repositoryPath,repositoryText } from './repository-files';
import { ensureProjectSource } from './publisher';
import { readdir } from 'node:fs/promises';
import matter from 'gray-matter';
import { load } from 'cheerio';
import { getSite } from './config';
import { inputSchema } from './article';
import { readArticles } from './store';
import { readProfile } from './postgres-store';
import { knowledge,saveKnowledge,library,saveLibrary,digest,type LibraryArticle } from './content-store';
export async function importBlogLibrary(){
 const site=getSite();await ensureProjectSource();const folder=await repositoryPath(site.repoPath,'content/blog');const items:LibraryArticle[]=[];
 for(const file of (await readdir(folder)).filter(n=>n.endsWith('.md'))){
  const {data,content}=matter(await repositoryText(site.repoPath,`content/blog/${file}`));
  if(data.status!=='published'||Date.parse(data.publishedAt)>Date.now())continue;
  const a=inputSchema.parse({...data,body:content});
  items.push({...a,source:`${site.url}/blog/${a.slug}`,hash:digest(a),syncedAt:new Date().toISOString()});
 }
 await saveLibrary(items);return items.length;
}
export function extractPage(html:string){const $=load(html);$('script,style,noscript,nav,footer,header,form,svg').remove();$('br').replaceWith(' ');$('p,h1,h2,h3,h4,li,section,div,span').append(' ');return {title:$('title').text().trim().slice(0,200)||'Website page',content:($('main').length?$('main').text():$('body').text()).replace(/\s+/g,' ').trim().slice(0,20000)};}
export async function importWebsite(){
 const site=getSite();await assertPublicWebsiteNetwork(site.url);const urls=[...new Set(['/',...site.links].map(p=>new URL(p,site.url).href))].slice(0,10);const existing=await knowledge();let count=0;const errors:string[]=[];
 for(const url of urls){
  if(new URL(url).origin!==new URL(site.url).origin)continue;
  try{
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Page unavailable');
   const reader=response.body?.getReader();if(!reader)throw new Error('Empty page');const chunks:Uint8Array[]=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw new Error('Page too large');}chunks.push(value);}
   const parsed=extractPage(Buffer.concat(chunks).toString('utf8'));if(!parsed.content)continue;
   const old=existing.find(k=>k.kind==='website'&&k.url===url);
   if(old?.content===parsed.content)continue;
   await saveKnowledge({...parsed,url,id:old?.id,revision:old?.revision,enabled:false},'website');count++;
  }catch{errors.push(url);}
 }
 return {count,errors};
}
export type EditorialContext={profile:Awaited<ReturnType<typeof readProfile>>;sources:{id:string;title:string;content:string;url:string;updatedAt:string}[];previous:{title:string;slug:string;description:string;body:string;publishedAt:string;status:string}[];catalog:{title:string;slug:string;description:string;publishedAt:string;status:string}[];links:string[];hash:string;omittedSources:number;omittedArticles:number};
const words=(s:string)=>new Set(s.toLowerCase().match(/[a-z]{3,}/g)||[]);
export function selectContext(topic:string,sources:EditorialContext['sources'],articles:EditorialContext['previous']){
 const terms=words(topic);const score=(s:string)=>[...words(s)].filter(w=>terms.has(w)).length;
 const ranked=[...articles].sort((a,b)=>score(b.title+' '+b.description+' '+b.body)-score(a.title+' '+a.description+' '+a.body)||b.publishedAt.localeCompare(a.publishedAt));
 // Include related full texts within an explicit budget and recent article metadata for topic planning.
 let remaining=65000;const previous:EditorialContext['previous']=[];
 for(const a of ranked){if(previous.length>=8)break;const body=a.body.slice(0,Math.min(16000,remaining));if(!body)break;remaining-=body.length;previous.push({...a,body});}
 const rankedSources=[...sources].sort((a,b)=>score(b.title+' '+b.content)-score(a.title+' '+a.content));remaining=45000;const selected:typeof sources=[];
 for(const s of rankedSources){if(remaining<=0)break;const content=s.content.slice(0,remaining);remaining-=content.length;selected.push({...s,content});}
 const catalog=[...articles].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,200).map(({title,slug,description,publishedAt,status})=>({title,slug,description,publishedAt,status}));
 return {sources:selected,previous,catalog,omittedSources:sources.length-selected.length,omittedArticles:articles.length-previous.length};
}
export async function editorialContext(topic:string,excludeId?:string):Promise<EditorialContext>{
 await importBlogLibrary();
 // A locked request shares one pg session; do not issue concurrent queries on it.
 const profile=await readProfile();const notes=await knowledge();const archive=await library();const managed=await readArticles();
 const own=managed.find(a=>a.id===excludeId);const combined=new Map(archive.filter(a=>a.slug!==own?.slug).map(a=>[a.slug,{...a,status:'published'}]));
 for(const a of managed.filter(a=>a.id!==excludeId))combined.set(a.slug,{...a,source:'admin',hash:digest(a),syncedAt:a.updatedAt});
 const selected=selectContext(topic,notes.filter(k=>k.enabled),[...combined.values()]);
 const links=[...getSite().links,...archive.map(a=>`/blog/${a.slug}`)];
 return {profile,...selected,links,hash:digest({profile,notes:notes.filter(k=>k.enabled).map(k=>[k.id,k.revision]),articles:[...combined.values()].map(a=>[a.slug,a.hash])})};
}
