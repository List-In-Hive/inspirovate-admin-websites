import { z } from 'zod';
import { json,readBody } from '../http';
import { knowledge,saveKnowledge,library,history,articleTasks,readMedia } from '../content-store';
import { importWebsite,importBlogLibrary } from '../knowledge';
import { withLock,readArticles } from '../store';
import { saveArticleUnlocked } from '../service';
import { reviewArticleUnlocked } from '../editorial';
import { articlePhotoUnlocked } from '../media';
export async function contentRoute(request:Request,path:string[]){
 const [section,id,operation]=path;const method=request.method;
 if(section==='knowledge'&&path.length===1){
  if(method==='GET')return json({data:await knowledge()});
  if(method==='POST'||method==='PUT'){const body=await readBody(request);return json({data:await withLock(()=>saveKnowledge(body))});}
 }
 if(section==='knowledge'&&id==='import'&&path.length===2&&method==='POST')return json({data:await withLock(()=>importWebsite())});
 if(section==='library'&&path.length===1){
  if(method==='GET')return json({data:await library()});
  if(method==='POST'){await withLock(()=>importBlogLibrary());return json({data:await library()});}
 }
 if(section==='media'&&path.length===2&&method==='GET'){
  const media=/^[a-f0-9]{64}$/.test(id)?await readMedia(id):undefined;
  if(!media)return json({message:'Photo not found'},404);
  return new Response(new Uint8Array(media.bytes),{headers:{'Content-Type':'image/webp','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
 }
 if(section==='articles'&&path.length===3){
  const article=(await readArticles()).find(a=>a.id===id);if(!article)return json({message:'Article not found'},404);
  if(operation==='history'&&method==='GET')return json({data:await history(id)});
  if(operation==='preparation'&&method==='GET')return json({data:await articleTasks(id)});
  if(operation==='restore'&&method==='POST'){
   const body=z.object({historyId:z.string(),revision:z.number().int()}).parse(await readBody(request));
   return json({data:await withLock(async()=>{
    const saved=(await history(id)).find(h=>h.id===body.historyId);if(!saved)throw new Error('Version not found.');
    return saveArticleUnlocked({...saved.payload,revision:body.revision},id);
   })});
  }
  if((operation==='review'||operation==='photo')&&method==='POST'){
   const body=z.object({requestId:z.uuid().optional(),revision:z.number().int(),instruction:z.string().max(2000).optional()}).parse(await readBody(request));
   return json({data:await withLock(async()=>{
    const current=(await readArticles()).find(a=>a.id===id);if(current?.revision!==body.revision)throw new Error('The article changed. Refresh before continuing.');
    return operation==='review'?reviewArticleUnlocked(id,body.requestId):articlePhotoUnlocked(id,body.requestId,body.instruction);
   })});
  }
 }
 return undefined;
}
