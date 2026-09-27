import type { Article } from './article';
import type { Slot,ScheduleSettings } from './schedule-store';
import { reviewDeadline } from './calendar';
type Operations={
  now:()=>number;
  generate:(slot:Slot)=>Promise<Article>;
  article:(id:string)=>Promise<Article|undefined>;
  publish:(article:Article,publishAt:string)=>Promise<Article>;
  verify:(article:Article)=>Promise<Article>;
  persist:(slot:Slot)=>Promise<void>;
};
export async function processSlot(slot:Slot,config:ScheduleSettings,d:Operations){
  if(!config.enabled||slot.status==='published'||(slot.retryAfter&&Date.parse(slot.retryAfter)>d.now()))return;
  try{
    if(!slot.articleId&&Date.parse(slot.generateAt)<=d.now()){
      const article=await d.generate(slot);
      slot.articleId=article.id;slot.generatedAt=new Date(d.now()).toISOString();slot.status='review';delete slot.error;
      if(config.latePolicy==='review24h')slot.publishAt=reviewDeadline(slot.publishAt,slot.generatedAt);
      await d.persist(slot);
    }
    if(!slot.articleId)return;
    let article=await d.article(slot.articleId);if(!article)throw new Error('Draft not found.');
    if(Date.parse(slot.publishAt)<=d.now()&&(!article.commit||(!article.pushedAt&&article.status==='failed'))){
      article=await d.publish(article,slot.publishAt);slot.status='publishing';await d.persist(slot);
    }
    if(article.commit){
      // If push failed, verify first, then retain failed status for a safe retry next run.
      const pushFailed=article.status==='failed'&&!article.pushedAt;
      const checked=await d.verify(article);
      if(pushFailed&&checked.status!=='published')throw new Error(article.error||'The push to GitHub has not been confirmed.');
      article=checked;slot.status=article.status==='published'?'published':'publishing';
      slot.error=article.error;delete slot.retryAfter;await d.persist(slot);
    }else if(article.status==='failed')throw new Error(article.error||'Could not send the article.');
  }catch(e){slot.error=(e as Error).message;slot.status='error';slot.retryAfter=new Date(d.now()+300000).toISOString();await d.persist(slot);}
}
