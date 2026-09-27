import path from "node:path";
import { AsyncLocalStorage } from 'node:async_hooks';
import { requireProject, type Project } from './projects';
import { hostedRuntime } from './runtime';
const activeProject = new AsyncLocalStorage<Project>();
// Legacy CLI entry points default to Flowers; HTTP handlers require a project in the URL.
export function withProject<T>(id: string | Project, work: () => T): T { return activeProject.run(typeof id==='string'?requireProject(id):id, work); }
export function getSite() {
  const project=activeProject.getStore() || requireProject('flowers');
  const prefix=project.id.toUpperCase().replace(/-/g,'_');
  const gitToken=process.env[`${prefix}_GITHUB_TOKEN`] || process.env.GITHUB_PROJECTS_TOKEN;
  return { ...project, gitToken,
    repository: gitToken ? `https://github.com/${project.repository}.git` : `git@github.com:${project.repository}.git`,
    repoPath: path.resolve((!hostedRuntime() && process.env[`${prefix}_REPO`]) || ((project.managed||hostedRuntime())?path.join(dataDir,`source-${project.id}`):path.join(process.cwd(),'..',project.id))),
  };
}
export const dataDir = path.resolve(process.env.ADMIN_DATA_DIR || path.join(process.cwd(), ".data"));
