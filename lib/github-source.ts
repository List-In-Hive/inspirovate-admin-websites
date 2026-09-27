import { githubRepository } from './repository-input';
export type RepositoryFile={path:string;sha:string;size:number;mode:string;type:string};
export type RepositorySnapshot={repository:string;name:string;description:string;homepage:string;branch:string;commit:string;files:RepositoryFile[];texts:{path:string;content:string}[];truncated:boolean};
export async function githubJSON<T>(resource:string):Promise<T>{
 const token=process.env.GITHUB_PROJECTS_TOKEN;
 const response=await fetch(`https://api.github.com${resource}`,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{})},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(response.status===404||response.status===401?'GitHub could not open this repository. Check the link; private repositories require GITHUB_PROJECTS_TOKEN on the server.':response.status===403||response.status===429?'GitHub access or rate limit reached. Check the server GitHub token and try later.':'GitHub could not read the repository.');
 const reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12*1024*1024){await reader.cancel();throw new Error('Repository metadata is too large to analyze automatically.');}chunks.push(value);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function redactRepositoryText(text:string){
 return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[private key removed]')
  .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9_]+|github_pat_[a-zA-Z0-9_]+)\b/g,'[credential removed]')
  .replace(/((?:password|api_?key|secret|access_?token)\s*[:=]\s*)["'][^"'\n]+["']/gi,'$1"[credential removed]"');
}
export function selectedSourceFiles(files:RepositoryFile[]){
 return files.filter(f=>f.type==='blob'&&f.mode==='100644'&&f.size<=150000&&!/(^|\/)(node_modules|\.git|\.next|dist|vendor|tests?|__tests__)(\/|$)/.test(f.path)&&
  (/^(README(?:\.md)?|package\.json|netlify\.toml|inspirovate\.json)$/i.test(f.path)||/^(src\/)?(app|pages)\/(.*\/)?(page|layout|index)\.(tsx?|jsx?|mdx)$/.test(f.path)||/^(src\/)?(lib|data|config)\/(seo|site|content|blog|publication)[\w.-]*\.(ts|js|json)$/.test(f.path)||/^scripts\/publication-manifest\.[cm]?[jt]s$/.test(f.path)||/^content\/blog\/[^/]+\.md$/.test(f.path)))
  .sort((a,b)=>(a.path==='package.json'?-1:b.path==='package.json'?1:a.path.localeCompare(b.path))).slice(0,35);
}
export async function repositorySnapshot(link:string):Promise<RepositorySnapshot>{
 const repository=githubRepository(link);const base=`/repos/${repository.split('/').map(encodeURIComponent).join('/')}`;
 const meta=await githubJSON<{name:string;description:string|null;homepage:string|null;default_branch:string;archived:boolean;disabled:boolean}>(base);
 if(meta.archived||meta.disabled)throw new Error('This GitHub repository is archived or disabled.');
 const commit=await githubJSON<{sha:string;commit:{tree:{sha:string}}}>(`${base}/commits/${encodeURIComponent(meta.default_branch)}`);
 const tree=await githubJSON<{tree:RepositoryFile[];truncated:boolean}>(`${base}/git/trees/${commit.commit.tree.sha}?recursive=1`);
 const texts:RepositorySnapshot['texts']=[];let budget=180000;
 for(const file of selectedSourceFiles(tree.tree)){
  if(budget<=0)break;
  const blob=await githubJSON<{encoding:string;content:string}>(`${base}/git/blobs/${file.sha}`);
  if(blob.encoding!=='base64')continue;
  const content=redactRepositoryText(Buffer.from(blob.content,'base64').toString('utf8')).slice(0,Math.min(budget,15000));budget-=content.length;texts.push({path:file.path,content});
 }
 return {repository,name:meta.name,description:meta.description||'',homepage:meta.homepage||'',branch:meta.default_branch,commit:commit.sha,files:tree.tree,texts,truncated:tree.truncated};
}
