import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from './database';
import { getSite } from './config';
import type { Article } from './article';
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const knowledgeSchema=z.object({id:z.string().max(100).optional(),title:z.string().trim().min(1).max(200),content:z.string().trim().min(1).max(20000),url:z.union([z.literal(''),z.url()]),enabled:z.boolean(),revision:z.number().int().optional()});
export type Knowledge=z.infer<typeof knowledgeSchema>&{id:string;revision:number;updatedAt:string;kind:'note'|'website'};
export async function knowledge():Promise<Knowledge[]>{return (await query('SELECT payload FROM inspirovate.knowledge WHERE site_id=$1 ORDER BY id',[getSite().id])).rows.map(r=>r.payload);}
export async function saveKnowledge(input:unknown,kind?:Knowledge['kind']){
 const parsed=knowledgeSchema.parse(input);const entries=await knowledge();const current=entries.find(k=>k.id===parsed.id);
 if(parsed.id&&!current)throw new Error('Knowledge entry not found.');
 if(current&&parsed.revision!==current.revision)throw new Error('Knowledge changed. Refresh the page.');
 if(!current&&entries.length>=100)throw new Error('This project has reached 100 knowledge entries. Edit or disable existing entries.');
 const item:Knowledge={...parsed,id:current?.id||randomUUID(),revision:(current?.revision||0)+1,kind:current?.kind||kind||'note',updatedAt:new Date().toISOString()};
 await query('INSERT INTO inspirovate.knowledge(site_id,id,payload) VALUES($1,$2,$3) ON CONFLICT(site_id,id) DO UPDATE SET payload=excluded.payload',[getSite().id,item.id,JSON.stringify(item)]);return item;
}
export type LibraryArticle={slug:string;title:string;description:string;body:string;publishedAt:string;coverImage:string;coverAlt:string;source:string;hash:string;syncedAt:string};
export async function library():Promise<LibraryArticle[]>{return (await query("SELECT payload FROM inspirovate.library WHERE site_id=$1 ORDER BY payload->>'publishedAt' DESC",[getSite().id])).rows.map(r=>r.payload);}
export async function saveLibrary(items:LibraryArticle[]){
 for(const item of items)await query('INSERT INTO inspirovate.library(site_id,slug,payload) VALUES($1,$2,$3) ON CONFLICT(site_id,slug) DO UPDATE SET payload=excluded.payload',[getSite().id,item.slug,JSON.stringify(item)]);
}
export type History={id:string;revision:number;payload:Article;savedAt:string};
export async function history(articleId:string):Promise<History[]>{return (await query('SELECT id::text,revision,payload,saved_at FROM inspirovate.article_history WHERE site_id=$1 AND article_id=$2 ORDER BY id DESC',[getSite().id,articleId])).rows.map(r=>({id:r.id,revision:r.revision,payload:r.payload,savedAt:new Date(r.saved_at).toISOString()}));}
export type AITask<T=unknown>={id:string;articleId:string;kind:'review'|'photo';status:'running'|'complete'|'failed';createdAt:string;model:string;inputHash:string;output?:T;error?:string;responseId?:string;inputTokens?:number;outputTokens?:number;context?:unknown};
export async function readTask<T>(id:string):Promise<AITask<T>|undefined>{return (await query('SELECT payload FROM inspirovate.ai_tasks WHERE site_id=$1 AND id=$2',[getSite().id,id])).rows[0]?.payload;}
export async function writeTask<T>(task:AITask<T>){await query('INSERT INTO inspirovate.ai_tasks(site_id,id,article_id,kind,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(site_id,id) DO UPDATE SET payload=excluded.payload',[getSite().id,task.id,task.articleId,task.kind,JSON.stringify(task)]);}
export async function articleTasks(articleId:string):Promise<AITask[]>{return (await query("SELECT payload FROM inspirovate.ai_tasks WHERE site_id=$1 AND article_id=$2 ORDER BY payload->>'createdAt' DESC",[getSite().id,articleId])).rows.map(r=>r.payload);}
export type Media={id:string;path:string;width:number;height:number;size:number;alt:string;prompt:string;model:string;createdAt:string;articleId:string};
export async function saveMedia(media:Media,bytes:Buffer){await query('INSERT INTO inspirovate.media(site_id,id,metadata,bytes) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[getSite().id,media.id,JSON.stringify(media),bytes]);}
export async function readMedia(id:string):Promise<{metadata:Media;bytes:Buffer}|undefined>{return (await query<{metadata:Media;bytes:Buffer}>('SELECT metadata,bytes FROM inspirovate.media WHERE site_id=$1 AND id=$2',[getSite().id,id])).rows[0];}
