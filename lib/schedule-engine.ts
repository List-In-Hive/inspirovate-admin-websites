import type { Article } from './article';
import type { Slot,ScheduleSettings,TopicPlan } from './schedule-store';
import { reviewDeadline } from './calendar';
import { NeedsAttentionError } from './errors';
type Operations={
  now:()=>number;
  generate:(slot:Slot)=>Promise<Article>;
  article:(id:string)=>Promise<Article|undefined>;
  publish:(article:Article,publishAt:string)=>Promise<Article>;
  verify:(article:Article)=>Promise<Article>;
  persist:(slot:Slot)=>Promise<void>;
};
type PlanOperations={
  now:()=>number;
  plan:(cycle:Slot[],others:Slot[])=>Promise<TopicPlan[]>;
  persist:(slot:Slot)=>Promise<void>;
};
const HOUR=3600000,DAY=24*HOUR;
// Automatic retries back off, then stop and wait for a person instead of failing every hour forever.
export const MAX_ATTEMPTS=5;
const BACKOFF=[1,3,6,12].map(hours=>hours*HOUR);
const iso=(time:number)=>new Date(time).toISOString();
export function topicText(plan:TopicPlan){
  return `Write the article for this approved plan. Reader question: ${plan.readerQuestion} Primary search phrase: ${plan.primaryKeyword} Search intent: ${plan.searchIntent}. Angle: ${plan.angle}`;
}
// A proposed plan is approved by a person or automatically when its review window ends.
export function planReady(slot:Slot,now:number){
  if(slot.planStatus==='planning')return false;
  if(slot.planStatus==='proposed')return Boolean(slot.planApproveAt)&&Date.parse(slot.planApproveAt!)<=now;
  return true;
}
const openForPlanning=(s:Slot)=>!s.articleId&&!s.planStatus&&!s.topic;
// One paid planning request per pass: the first due cycle gets topics for all its open slots.
export async function planDueCycles(all:Slot[],config:Pick<ScheduleSettings,'enabled'|'approvalDays'>,d:PlanOperations){
  if(!config.enabled)return false;
  const now=d.now();
  for(const s of all)if(s.planStatus==='planning'&&Date.parse(s.planStartedAt||'')<now-HOUR){
    s.planStatus='failed';s.error='Topic planning was interrupted. Re-plan the cycle or enter topics manually.';await d.persist(s);
  }
  const due=all.find(s=>openForPlanning(s)&&s.planAt&&Date.parse(s.planAt)<=now);
  if(!due)return false;
  await planCycle(all.filter(s=>s.month===due.month&&openForPlanning(s)),all,config.approvalDays,d);
  return true;
}
// Marks the slots before paying, so an interrupted request is never repeated automatically.
export async function planCycle(cycle:Slot[],all:Slot[],approvalDays:number,d:PlanOperations){
  const now=d.now();
  for(const s of cycle){s.planStatus='planning';s.planStartedAt=iso(now);await d.persist(s);}
  try{
    const plans=await d.plan(cycle,all.filter(s=>!cycle.includes(s)));
    cycle.forEach((s,i)=>{
      s.plan=plans[i];s.topic=topicText(plans[i]);s.planStatus='proposed';delete s.error;
      s.planApproveAt=iso(Math.max(now,Math.min(now+approvalDays*DAY,Date.parse(s.publishAt)-2*DAY)));
    });
  }catch(e){
    for(const s of cycle){s.planStatus='failed';s.error=`Topic plan failed: ${(e as Error).message} AI will choose the topic when it writes the draft, or you can enter a topic manually.`;}
  }
  for(const s of cycle)await d.persist(s);
}
export async function processSlot(slot:Slot,config:Pick<ScheduleSettings,'enabled'|'latePolicy'>,d:Operations):Promise<'generated'|undefined>{
  if(!config.enabled||slot.status==='published'||(slot.retryAfter&&Date.parse(slot.retryAfter)>d.now()))return;
  if(slot.status==='error'&&!slot.retryAfter&&(slot.attempts||0)>=MAX_ATTEMPTS)return;
  let result:'generated'|undefined;
  try{
    if(!slot.articleId&&Date.parse(slot.generateAt)<=d.now()&&planReady(slot,d.now())){
      const article=await d.generate(slot);result='generated';
      slot.articleId=article.id;slot.generatedAt=new Date(d.now()).toISOString();slot.status='review';delete slot.error;delete slot.attempts;
      if(config.latePolicy==='review24h')slot.publishAt=reviewDeadline(slot.publishAt,slot.generatedAt);
      await d.persist(slot);
    }
    if(!slot.articleId)return result;
    let article=await d.article(slot.articleId);if(!article)throw new Error('Draft not found.');
    // Blocked drafts wait for a person's edit; any saved change creates a new revision and is retried.
    if(slot.status==='attention'&&article.revision===slot.blockedRevision)return result;
    if(Date.parse(slot.publishAt)<=d.now()&&(!article.commit||(!article.pushedAt&&article.status==='failed'))){
      article=await d.publish(article,slot.publishAt);slot.status='publishing';delete slot.blockedRevision;await d.persist(slot);
    }
    if(article.commit){
      // If push failed, verify first, then retain failed status for a safe retry next run.
      const pushFailed=article.status==='failed'&&!article.pushedAt;
      const checked=await d.verify(article);
      if(pushFailed&&checked.status!=='published')throw new Error(article.error||'The push to GitHub has not been confirmed.');
      article=checked;slot.status=article.status==='published'?'published':'publishing';
      slot.error=article.error;delete slot.retryAfter;if(slot.status==='published')delete slot.attempts;await d.persist(slot);
    }else if(article.status==='failed')throw new Error(article.error||'Could not send the article.');
  }catch(e){
    slot.error=(e as Error).message;
    if(e instanceof NeedsAttentionError){slot.status='attention';slot.blockedRevision=e.revision;delete slot.retryAfter;}
    else{
      slot.status='error';slot.attempts=(slot.attempts||0)+1;
      if(slot.attempts>=MAX_ATTEMPTS){delete slot.retryAfter;slot.error+=' Automatic retries have stopped; retry from the calendar after fixing the cause.';}
      else slot.retryAfter=new Date(d.now()+BACKOFF[slot.attempts-1]).toISOString();
    }
    await d.persist(slot);
  }
  return result;
}
