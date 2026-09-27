import { databaseConfigured, query } from './database';
import { projects, type Project, type ProjectSummary } from './projects';
import { profileSchema } from './profile';
import { z } from 'zod';
import { publicWebsite } from './repository-input';

export async function listProjects(includeArchived=false):Promise<ProjectSummary[]> {
 if(!databaseConfigured())return projects.map(p=>({...p,automationEnabled:false,archivedAt:null}));
 const rows=(await query(`SELECT p.payload,p.archived_at,s.payload->>'enabled' AS enabled FROM inspirovate.projects p LEFT JOIN inspirovate.schedules s ON s.id=p.id ${includeArchived?'':'WHERE p.archived_at IS NULL'} ORDER BY p.created_at,p.id`)).rows;
 return rows.map(r=>({...r.payload,automationEnabled:r.enabled==='true'&&!r.archived_at,archivedAt:r.archived_at?new Date(r.archived_at).toISOString():null}));
}
export async function projectById(id:string,includeArchived=false) {return (await listProjects(includeArchived)).find(p=>p.id===id);}
export function assertProjectReady(p:Project,allowLocalDrafts=false) {
 if(p.localOnly){if(allowLocalDrafts)return;throw new Error('This is a local test project. Automatic and GitHub publication are disabled.');}
 if(p.setup&&(!p.setup.compatible||!p.setup.reviewed))throw new Error('Review this project’s setup and resolve its compatibility issues before creating or publishing articles.');
 publicWebsite(p.url);
}
// All mutations are called while holding the same lock as the scheduler.
export async function insertProject(p:Project,profile:unknown) {
 const parsed=profileSchema.parse(profile);
 await query(`WITH project AS (
  INSERT INTO inspirovate.projects(id,repository,payload) VALUES($1,$2,$3) RETURNING id
 ), profile AS (
  INSERT INTO inspirovate.profile(id,payload) SELECT id,$4::jsonb FROM project RETURNING id
 ) INSERT INTO inspirovate.schedules(id,payload) SELECT id,$5::jsonb FROM profile`,
 [p.id,p.repository,JSON.stringify(p),JSON.stringify(parsed),JSON.stringify({perMonth:4,enabled:false,latePolicy:'review24h'})]);
}
export async function updateProject(id:string,input:unknown) {
 const p=await projectById(id,true);if(!p)throw new Error('Project not found.');
 const action=z.object({action:z.enum(['archive','restore','automation','review','recheck'])}).parse(input).action;
 if(action==='archive'||action==='restore') {
  await query("UPDATE inspirovate.schedules SET payload=jsonb_set(payload,'{enabled}','false'::jsonb) WHERE id=$1",[id]);
  await query(`UPDATE inspirovate.projects SET archived_at=${action==='archive'?'now()':'NULL'} WHERE id=$1`,[id]);
  return;
 }
 if(p.archivedAt)throw new Error('Restore this project first.');
 if(action==='recheck') {
  const {repositorySnapshot}=await import('./github-source');const {inspectRepository}=await import('./project-onboarding');
  const snapshot=await repositorySnapshot(`https://github.com/${p.repository}`);const scan=inspectRepository(snapshot);
  const {automationEnabled,archivedAt,...metadata}=p;void automationEnabled;void archivedAt;
  metadata.branch=snapshot.branch;metadata.links=scan.links;metadata.covers=scan.covers;
  metadata.setup={compatible:scan.compatible,reviewed:false,issues:scan.issues,evidence:snapshot.texts.map(t=>t.path),analyzedCommit:snapshot.commit};
  await query("UPDATE inspirovate.schedules SET payload=jsonb_set(payload,'{enabled}','false'::jsonb) WHERE id=$1",[id]);
  await query('UPDATE inspirovate.projects SET payload=$2 WHERE id=$1',[id,JSON.stringify(metadata)]);return;
 }
 if(action==='automation') {
  const {enabled}=z.object({enabled:z.boolean()}).parse(input);if(enabled)assertProjectReady(p);
  await query("UPDATE inspirovate.schedules SET payload=jsonb_set(payload,'{enabled}',$2::jsonb) WHERE id=$1",[id,JSON.stringify(enabled)]);return;
 }
 const {url}=z.object({url:z.string().max(2000)}).parse(input);const site=publicWebsite(url);
 if(p.setup&&!p.setup.compatible)throw new Error('This repository needs the supported blog integration before it can be activated.');
 const {automationEnabled,archivedAt,...metadata}=p;void automationEnabled;void archivedAt;
 metadata.url=site;metadata.setup={...p.setup!,compatible:true,reviewed:true,issues:[],evidence:p.setup?.evidence||[]};
 await query('UPDATE inspirovate.projects SET payload=$2 WHERE id=$1',[id,JSON.stringify(metadata)]);
}
