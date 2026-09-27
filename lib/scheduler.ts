import { getSite, withProject } from "./config";
import { listProjects } from "./project-catalog";
import { withLock, readArticles, writeArticles } from "./store";
import { settings, slots, writeSlot, ensureCalendar } from "./schedule-store";
import { generateScheduledArticleUnlocked } from "./ai-service";
import { actOnArticleUnlocked } from "./service";
import { query } from "./database";
import { processSlot } from './schedule-engine';
export async function schedulerTick() {
  const failed:string[]=[];
  for (const project of await listProjects()) {
    if(project.localOnly)continue;
    try { await withProject(project, () => tickProject()); }
    catch { failed.push(project.name); }
  }
  if(failed.length) throw new Error(`Scheduler check failed for: ${failed.join(', ')}. Check the project settings and calendar.`);
}
async function tickProject() {
  return withLock(async()=>{
    await query("INSERT INTO inspirovate.worker(id,heartbeat) VALUES($1,now()) ON CONFLICT(id) DO UPDATE SET heartbeat=now()",[getSite().id]);
    const config=await settings();if(!config.enabled)return;
    await ensureCalendar();
    for(const slot of await slots()) await processSlot(slot,config,{
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
    });
  });
}
