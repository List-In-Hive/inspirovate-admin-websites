import { contentRoute } from "@/lib/handlers/content";
import { withProject } from '@/lib/config';
import { projectById } from '@/lib/project-catalog';
import { assertLocal, failure, json } from '@/lib/http';
import * as articles from '@/lib/handlers/articles';
import * as article from '@/lib/handlers/article';
import * as action from '@/lib/handlers/article-action';
import * as rewrite from '@/lib/handlers/rewrite';
import * as schedule from '@/lib/handlers/schedule';
import * as slot from '@/lib/handlers/slot';
import * as generateSlot from '@/lib/handlers/slot-generate';
import * as generations from '@/lib/handlers/generations';
import * as integrations from '@/lib/handlers/integrations';
import * as profile from '@/lib/handlers/profile';
export const runtime = 'nodejs';
type Context = {params:Promise<{projectId:string;path:string[]}>};
async function dispatch(request:Request,context:Context) {
  try {
    assertLocal(request);
    const {projectId,path}=await context.params;
    const project=await projectById(projectId);
    if(!project)return json({message:'Project not found'},404);
    return await withProject(project,async()=>{
      const content=await contentRoute(request,path);if(content)return content;
      const [section,id,operation]=path;
      const method=request.method;
      const params={params:Promise.resolve({id,action:operation})};
      if(path.length===1) {
        if(section==='articles') { if(method==='GET')return articles.GET(request);if(method==='POST')return articles.POST(request); }
        if(section==='schedule') { if(method==='GET')return schedule.GET(request);if(method==='PUT')return schedule.PUT(request); }
        if(section==='generations') { if(method==='GET')return generations.GET(request);if(method==='POST')return generations.POST(request); }
        if(section==='integrations') { if(method==='GET')return integrations.GET(request);if(method==='POST')return integrations.POST(request); }
        if(section==='profile') { if(method==='GET')return profile.GET(request);if(method==='PUT')return profile.PUT(request); }
      }
      if(path.length===2 && section==='articles') { if(method==='GET')return article.GET(request,params);if(method==='PUT')return article.PUT(request,params); }
      if(path.length===2 && section==='schedule' && method==='PUT')return slot.PUT(request,params);
      if(path.length===3 && method==='POST') {
        if(section==='schedule' && operation==='generate')return generateSlot.POST(request,params);
        if(section==='articles' && operation==='rewrite')return rewrite.POST(request,params);
        if(section==='articles' && ['approve','publish','publish-now','verify'].includes(operation))return action.POST(request,params);
      }
      return json({message:'Project endpoint not found'},404);
    });
  }catch(e){return failure(e);}
}
export {dispatch as GET,dispatch as POST,dispatch as PUT};
