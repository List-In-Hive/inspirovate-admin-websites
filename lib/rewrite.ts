import { editorialContext } from "./knowledge";
import { z } from "zod";
import { withLock,readArticles,writeArticles } from "./store";
import { readGeneration,writeGeneration,readProfile,type Generation } from "./postgres-store";
import { createAIContent,openAIConfigured,openAIModel } from "./openai";
import { databaseConfigured } from "./database";
import { inputSchema } from "./article";
import { validateAgainstRepo } from "./publisher";
export async function rewriteArticle(id:string,input:unknown) {
  const request=z.object({id:z.uuid(),revision:z.number().int(),prompt:z.string().trim().min(3).max(3000)}).parse(input);
  if(!databaseConfigured()||!openAIConfigured())throw new Error('Connect Supabase and OpenAI first.');
  return withLock(async()=>{
    const articles=await readArticles();const article=articles.find(a=>a.id===id);if(!article)throw new Error('Article not found.');
    let job=await readGeneration(request.id);
    if(job&&(job.kind!=='revision'||job.articleId!==id||job.topic!==request.prompt))throw new Error('Start a new request for different content.');
    if(article.lastAIRequest===request.id)return article;
    if(article.revision!==request.revision)throw new Error('The article has changed. Refresh the page before requesting an AI revision.');
    if(article.commit||article.status==='deploying')throw new Error('This article has already been sent to the website.');
    if(job&&!job.output)throw new Error('This request was already sent. Check the OpenAI logs before starting another paid request.');
    if(!job){
      job={id:request.id,kind:'revision',sourceRevision:article.revision,articleId:id,topic:request.prompt,coverImage:article.coverImage,coverAlt:article.coverAlt,model:openAIModel(),status:'generating',createdAt:new Date().toISOString()} satisfies Generation;
      await writeGeneration(job);
      try{Object.assign(job,await createAIContent(request.prompt,await readProfile(),[],article,await editorialContext(article.title,id)));job.status='generated';await writeGeneration(job);}
      catch(e){job.status='failed';job.error=(e as Error).message;await writeGeneration(job);throw e;}
    }
    const changed={...article,...inputSchema.parse({...article,...job.output,slug:article.slug}),revision:article.revision+1,status:'draft' as const,approvedHash:undefined,error:undefined,lastAIRequest:request.id,updatedAt:new Date().toISOString()};
    await validateAgainstRepo(changed);
    await writeArticles(articles.map(a=>a.id===id?changed:a));
    job.status='succeeded';await writeGeneration(job);return changed;
  });
}
