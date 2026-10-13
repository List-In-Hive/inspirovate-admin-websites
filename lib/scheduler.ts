import { getSite, withProject } from "./config";
import { listProjects } from "./project-catalog";
import { withLock, readArticles, writeArticles } from "./store";
import { settings, slots, writeSlot, ensureCalendar, cycleOf } from "./schedule-store";
import { generateScheduledArticleUnlocked } from "./ai-service";
import { actOnArticleUnlocked } from "./service";
import { query } from "./database";
import { planCycle, planDueCycles, processSlot } from './schedule-engine';
import { planTopics } from './topic-plan';
import { heartbeatSql, workerTrigger } from './worker-status';
import { LockBusyError } from './errors';
import type { Project } from './projects';
type PassOptions={concurrency?:number;deadline?:number;log?:(message:string)=>void};
// Projects run in parallel (each under its own lock); each project does at most one paid step per pass,
// so the lock is released between steps and people can keep editing while a cycle is prepared.
export async function schedulerTick({concurrency=1,deadline,log=console.error}:PassOptions={}) {
  const projects=(await listProjects()).filter(p=>!p.localOnly);
  const failed:string[]=[];
  let next=0;
  const runProject=async(project:Project)=>{
    try{
      while(await withProject(project,()=>tickProject())){ if(!deadline||Date.now()>deadline)break; }
    }catch(e){
      if(e instanceof LockBusyError)return;
      log(`[scheduler] ${project.name}: ${(e as Error).message}`);failed.push(project.name);
    }
  };
  await Promise.all(Array.from({length:Math.max(1,Math.min(concurrency,projects.length))},async()=>{
    while(next<projects.length)await runProject(projects[next++]);
  }));
  if(failed.length) throw new Error(`Scheduler check failed for: ${failed.join(', ')}. Check the project settings and calendar.`);
}
// Returns true when a paid step ran, so a one-shot runner can continue with the same project.
async function tickProject() {
  return withLock(async()=>{
    await query(heartbeatSql,[getSite().id,workerTrigger()]);
    const config=await settings();if(!config.enabled)return false;
    await ensureCalendar();
    const all=await slots();
    if(await planDueCycles(all,config,{now:Date.now,plan:planTopics,persist:writeSlot}))return true;
    for(const slot of all) if(await processSlot(slot,config,{
      now:Date.now,
      generate:generateScheduledArticleUnlocked,
      article:async id=>(await readArticles()).find(a=>a.id===id),
      persist:writeSlot,
      publish:async(article,publishAt)=>{
        if(!article.commit){
          const all=await readArticles();article=all.find(a=>a.id===article.id)!;
          article.publishedAt=publishAt;article.revision++;article.updatedAt=new Date().toISOString();await writeArticles(all);
          article=await actOnArticleUnlocked(article.id,'approve',article.revision);
        }
        return actOnArticleUnlocked(article.id,'publish',article.revision);
      },
      verify:article=>actOnArticleUnlocked(article.id,'verify',article.revision),
    })==='generated')return true;
    return false;
  });
}
// Caller holds the project lock. A person asked for new topics: a new paid request for the open slots of this cycle.
export async function replanCycleUnlocked(id:string){
  const all=await slots();const slot=all.find(s=>s.id===id);if(!slot)throw new Error('Scheduled entry not found.');
  const config=await settings();
  const cycle=cycleOf(all,slot).filter(s=>s.planStatus!=='approved'&&s.planStatus!=='planning');
  if(!cycle.length)throw new Error('All topics in this cycle are approved or already have drafts.');
  for(const s of cycle){s.topic='';delete s.plan;delete s.planStatus;delete s.planApproveAt;}
  await planCycle(cycle,all,config.approvalDays,{now:Date.now,plan:planTopics,persist:writeSlot});
  return cycle;
}
