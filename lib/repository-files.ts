import { realpath,readFile,lstat } from 'node:fs/promises';
import path from 'node:path';
// Repositories are data. Never follow their symlinks outside the checkout.
export async function repositoryPath(root:string,relative:string){
 const base=await realpath(root);const requested=path.resolve(base,relative);
 if(!requested.startsWith(base+path.sep))throw new Error('Invalid repository path.');
 let current=base;
 for(const part of path.relative(base,requested).split(path.sep)){
  current=path.join(current,part);
  try{if((await lstat(current)).isSymbolicLink())throw new Error('Repository content paths must not contain symbolic links.');}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 }
 return requested;
}
export async function repositoryText(root:string,relative:string,maxBytes=200000){
 const filename=await repositoryPath(root,relative);const stat=await lstat(filename);
 if(!stat.isFile()||stat.size>maxBytes)throw new Error('Repository content file is not a supported size or type.');
 return readFile(filename,'utf8');
}
