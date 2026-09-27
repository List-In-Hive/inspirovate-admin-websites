import type { Article } from './article';
type Operations={now:()=>number;save:(article:Article)=>Promise<void>;approve:(article:Article)=>Promise<Article>;publish:(article:Article)=>Promise<Article>;completeSchedule:(article:Article,when:string)=>Promise<void>};
export async function publishImmediately(article:Article,d:Operations){
 if(article.commit||article.status==='published')throw new Error('This article has already been sent to the website.');
 const when=new Date(d.now()).toISOString();
 const draft:Article={...article,publishedAt:when,status:'draft',approvedHash:undefined,revision:article.revision+1,updatedAt:when};
 await d.save(draft);
 const approved=await d.approve(draft);const result=await d.publish(approved);
 // A committed article is now owned by this publication attempt, even when its push needs a retry.
 if(result.commit)await d.completeSchedule(result,when);
 return result;
}
