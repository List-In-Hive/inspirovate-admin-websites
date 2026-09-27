import type { AITask } from './content-store';
// The caller holds the shared application lock. Persist intent before paying; never retry ambiguous failures automatically.
export async function paidTask<T>(initial:AITask<T>,read:(id:string)=>Promise<AITask<T>|undefined>,write:(task:AITask<T>)=>Promise<void>,run:()=>Promise<{output:T;responseId?:string;inputTokens?:number;outputTokens?:number}>){
 let task=await read(initial.id);
 if(task){
  if(task.articleId!==initial.articleId||task.kind!==initial.kind||task.inputHash!==initial.inputHash)throw new Error('This request ID was used for different content.');
  if(task.output){if(task.status!=='complete'){task.status='complete';delete task.error;await write(task);}return task;}
  throw new Error(task.error||'This paid request was already sent. Check its status before starting a new paid request.');
 }
 task=initial;await write(task);
 try{Object.assign(task,await run(),{status:'complete'});await write(task);return task;}
 catch(e){task.status='failed';task.error=(e as Error).message;await write(task);throw e;}
}
