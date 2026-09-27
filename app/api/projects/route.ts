import { listProjects } from '@/lib/project-catalog';
import { addProject } from '@/lib/project-onboarding';
import { assertLocal, failure, json,readBody } from '@/lib/http';
import { withDatabaseLock } from '@/lib/database';
import { databaseConfigured } from '@/lib/database';
export const runtime='nodejs';
export async function GET(request: Request) { try { assertLocal(request);const data=await listProjects(new URL(request.url).searchParams.get('archived')==='true'); return json({data,total:data.length}); } catch(e) { return failure(e); } }
export async function POST(request:Request){try{assertLocal(request);if(!databaseConfigured())throw new Error('Connect Supabase before adding a project.');const body=await readBody(request);return json({data:await withDatabaseLock(()=>addProject(body))},201);}catch(e){return failure(e);}}
