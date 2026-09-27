import { assertLocal,failure,json,readBody } from '@/lib/http';
import { updateProject } from '@/lib/project-catalog';
import { withDatabaseLock } from '@/lib/database';
export async function PUT(request:Request,context:{params:Promise<{projectId:string}>}){try{assertLocal(request);const {projectId}=await context.params;const body=await readBody(request);await withDatabaseLock(()=>updateProject(projectId,body));return json({data:{id:projectId}});}catch(e){return failure(e);}}
