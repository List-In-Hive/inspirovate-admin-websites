// Public project metadata only. Server credentials never belong in this registry.
export type Project = {
  id: string; name: string; brand: string; description: string; url: string;
  repository: string; branch: string; links: string[];
  covers: { id: string; name: string; alt: string }[];
  managed?: boolean;
  localOnly?: boolean;
  setup?: { compatible: boolean; reviewed: boolean; issues: string[]; evidence: string[]; analyzedCommit?: string };
};
export type ProjectSummary = Project & { automationEnabled: boolean; archivedAt: string | null };
export const projects: Project[] = [{
  id: 'flowers', name: 'Flowers', brand: 'Petal & Stem',
  description: 'Seasonal flowers, thoughtful bouquets and event enquiries.',
  url: 'https://flowerslih.netlify.app', repository: 'List-In-Hive/flowers_test', branch: 'main',
  links: ['/flowers', '/contact'],
  covers: [{ id: '/images/hero.webp', name: 'Featured arrangement', alt: 'A floral arrangement' },
    ...['Pink roses', 'White flowers', 'Burgundy dahlias', 'Peach roses', 'Lilac bouquet', 'Yellow flowers'].map((name,i)=>({id:`/images/arrangement-${i+1}.webp`,name,alt:name}))],
}];
export function findProject(id: string) { return projects.find(p=>p.id===id); }
export function requireProject(id: string): Project {
  const project=findProject(id); if(!project) throw new Error('Project not found.'); return project;
}
export function projectPath(id: string, section = '') { return `/projects/${encodeURIComponent(id)}${section ? `/${section}` : ''}`; }
