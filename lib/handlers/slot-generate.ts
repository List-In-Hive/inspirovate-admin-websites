import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertLocal,failure,json,readBody } from "@/lib/http";
import { withLock } from "@/lib/store";
import { slots,writeSlot } from "@/lib/schedule-store";
import { generateScheduledArticleUnlocked } from "@/lib/ai-service";
import { openAIConfigured } from "@/lib/openai";

export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
  assertLocal(request);if(!openAIConfigured())throw new Error('Add your OpenAI key.');const {id}=await context.params;const {retry}=z.object({retry:z.boolean().optional()}).parse(await readBody(request));
  return json({data:await withLock(async()=>{
    const slot=(await slots()).find(s=>s.id===id);if(!slot)throw new Error('Scheduled entry not found.');
    if(slot.articleId)return {id:slot.articleId};
    if(retry&&slot.status==='error'){slot.generationId=randomUUID();await writeSlot(slot);}
    const article=await generateScheduledArticleUnlocked(slot);
    slot.articleId=article.id;slot.generatedAt=new Date().toISOString();slot.status='review';delete slot.error;delete slot.retryAfter;await writeSlot(slot);return article;
  })});
}catch(e){return failure(e);}}
