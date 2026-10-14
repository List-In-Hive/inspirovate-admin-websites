import { z } from 'zod';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent, Root } from 'mdast';
export const formatSchema=z.object({photoCount:z.number().int().min(1).max(6).default(2),externalLinkCount:z.number().int().min(0).max(10).default(3),internalLinkCount:z.number().int().min(0).max(10).default(3)});
export type ArticleFormat=z.infer<typeof formatSchema>;
// How a project's images look. An empty style means realistic editorial photography.
export const imageAspects=['16:9','3:2','4:3','1:1'] as const;
export const visualSchema=z.object({imageStyle:z.string().trim().max(1500).default(''),imageAspect:z.enum(imageAspects).default('3:2')});
export type VisualSettings=z.infer<typeof visualSchema>;
export function nearestAspect(width:number,height:number){
 const ratio=width/height;const value=(a:string)=>{const [w,h]=a.split(':').map(Number);return w/h;};
 return [...imageAspects].sort((a,b)=>Math.abs(Math.log(value(a)/ratio))-Math.abs(Math.log(value(b)/ratio)))[0];
}
export type ArticleSource={url:string;title:string};
export type ArticlePhoto={path:string;alt:string};
export function markdownAssets(body:string){
 const tree=fromMarkdown(body);const definitions=new Map<string,string>();
 const links:string[]=[];const images:string[]=[];let html=false;
 function walk(node:Root|RootContent,read:(n:Root|RootContent)=>void){read(node);if('children' in node)for(const child of node.children)walk(child,read);}
 walk(tree,n=>{if(n.type==='definition')definitions.set(n.identifier,n.url);});
 walk(tree,n=>{
  if(n.type==='link')links.push(n.url);
  if(n.type==='image')images.push(n.url);
  if(n.type==='linkReference')links.push(definitions.get(n.identifier)||'');
  if(n.type==='imageReference')images.push(definitions.get(n.identifier)||'');
  if(n.type==='html')html=true;
 });
 return {links:[...new Set(links)],images:[...new Set(images)],html};
}
export function normalizedLink(value:string,origin:string){
 try{const url=new URL(value,origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';
 url.hash='';
 // DOI resolvers accept an encoded slash in the identifier; compare its canonical form.
 if(url.hostname==='doi.org'||url.hostname==='dx.doi.org'){url.hostname='doi.org';url.pathname=url.pathname.replace(/%2f/ig,'/');}
 return url.origin===new URL(origin).origin?url.pathname+url.search:url.href;}catch{return '';}
}
export function linkProblems(body:string,allowed:string[],origin:string,format?:ArticleFormat){
 const targets=[...new Set(markdownAssets(body).links.map(v=>normalizedLink(v,origin)))];
 const known=new Set(allowed.map(v=>normalizedLink(v,origin)).filter(Boolean));
 const errors=targets.filter(v=>!v||!known.has(v)).map(v=>`Unverified link: ${v||'invalid URL'}`);
 if(format){
  const internal=targets.filter(v=>v.startsWith('/')).length,external=targets.filter(v=>v.startsWith('http')).length;
  if(internal!==format.internalLinkCount)errors.push(`Expected ${format.internalLinkCount} unique internal links; found ${internal}.`);
  if(external!==format.externalLinkCount)errors.push(`Expected ${format.externalLinkCount} unique external links; found ${external}.`);
 }
 return errors;
}
export function withoutPhotos(body:string){
 const tree=fromMarkdown(body);const spans:{start:number;end:number}[]=[];
 function walk(n:Root|RootContent){if(n.type==='image'||n.type==='imageReference'){if(n.position)spans.push({start:n.position.start.offset!,end:n.position.end.offset!});}else if('children' in n)for(const c of n.children)walk(c);}
 walk(tree);for(const s of spans.sort((a,b)=>b.start-a.start))body=body.slice(0,s.start)+body.slice(s.end);return body.trim();
}
export function placePhotos(body:string,photos:ArticlePhoto[]){
 const text=withoutPhotos(body).replace(/\n{3,}/g,'\n\n');const sections=text.split(/\n(?=## )/).map(s=>s.trim());const extras=photos.slice(1);
 for(let i=extras.length-1;i>=0;i--){const position=Math.min(sections.length,Math.max(1,Math.floor((i+1)*sections.length/(extras.length+1))));
 const p=extras[i];sections.splice(position,0,`![${p.alt.replace(/[\[\]\\\r\n]/g,' ')}](${p.path})\n`);}
 return sections.join('\n\n').trim();
}
export function photoPaths(article:{coverImage:string;body:string}){return [...new Set([article.coverImage,...markdownAssets(article.body).images])];}
export function formatInstructions(format:ArticleFormat){return `Use exactly ${format.internalLinkCount} distinct relevant internal links and ${format.externalLinkCount} distinct relevant external source links. Use contextual Markdown links with descriptive labels, never raw URLs or filler to meet a count. Do not invent sources; report a shortage rather than fabricating. Photos are added separately by the application (${format.photoCount} unique photos including the cover); do not insert images yourself.`;}

// Canonical prose excludes only registered photos. Unmanaged images still invalidate review.
export function editorialText(body:string,photos:ArticlePhoto[]=[]){
 const tree=fromMarkdown(body);const spans:{start:number;end:number}[]=[];
 function walk(n:Root|RootContent){
  if(n.type==='image'&&photos.some(p=>p.path===n.url)&&n.position)spans.push({start:n.position.start.offset!,end:n.position.end.offset!});
  else if('children' in n)for(const c of n.children)walk(c);
 }
 walk(tree);for(const s of spans.sort((a,b)=>b.start-a.start))body=body.slice(0,s.start)+body.slice(s.end);
 return body.replace(/\n{3,}/g,'\n\n').trim();
}
export function articleWordCount(body:string){
 const tree=fromMarkdown(body);const words:string[]=[];
 function walk(n:Root|RootContent){
  if(n.type==='image'||n.type==='imageReference'||n.type==='definition')return;
  if(n.type==='text'||n.type==='inlineCode'||n.type==='code')words.push(n.value);
  else if('children' in n)for(const c of n.children)walk(c);
 }
 walk(tree);return words.join(' ').match(/\S+/g)?.length||0;
}
export const ARTICLE_LENGTH_RULE='450–650 words, including headings and link labels but excluding image descriptions and URLs';
export function photoDescription(title:string,body:string,index:number){
 const headings=fromMarkdown(body).children.filter(n=>n.type==='heading');
 const heading=headings[index-1];
 const detail=heading?.children.map(n=>'value' in n?n.value:'').join('')||title;
 return (index===0?`Cover illustration: ${title}`:`Supporting illustration ${index}: ${detail}`).slice(0,220);
}
// Strip ineligible destinations before editorial repair while preserving the words.
export function removeUnknownInternalLinks(body:string,allowed:string[],origin:string){
 const tree=fromMarkdown(body);const defs=new Map<string,string>();const spans:{start:number;end:number;text:string}[]=[];
 const known=new Set(allowed.map(v=>normalizedLink(v,origin)));
 for(const n of tree.children)if(n.type==='definition')defs.set(n.identifier,n.url);
 function label(n:RootContent):string{return 'children' in n?n.children.map(label).join(''):'value' in n?n.value:'';}
 function walk(n:Root|RootContent){
  if(n.type==='link'||n.type==='linkReference'){
   const url=normalizedLink(n.type==='link'?n.url:defs.get(n.identifier)||'',origin);
   if(url.startsWith('/')&&!known.has(url)&&n.position){spans.push({start:n.position.start.offset!,end:n.position.end.offset!,text:label(n)});return;}
  }
  if('children' in n)for(const c of n.children)walk(c);
 }
 walk(tree);for(const s of spans.sort((a,b)=>b.start-a.start))body=body.slice(0,s.start)+s.text+body.slice(s.end);
 return body;
}
