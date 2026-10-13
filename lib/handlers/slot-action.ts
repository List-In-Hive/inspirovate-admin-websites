import { assertLocal,failure,json } from "@/lib/http";
import { withLock } from "@/lib/store";
import { approveCycle,slots,writeSlot } from "@/lib/schedule-store";
import { replanCycleUnlocked } from "@/lib/scheduler";
import { openAIConfigured } from "@/lib/openai";

// approve: accept the proposed topics of the slot's cycle. plan: paid re-plan of its open topics.
// retry: let the scheduler try a stopped or blocked entry again on its next pass.
export async function POST(request:Request,context:{params:Promise<{id:string;action:string}>}){try{
  assertLocal(request);const {id,action}=await context.params;
  return json({data:await withLock(async()=>{
    if(action==='approve')return {approved:await approveCycle(id)};
    if(action==='plan'){if(!openAIConfigured())throw new Error('Add your OpenAI key.');return {planned:(await replanCycleUnlocked(id)).length};}
    const slot=(await slots()).find(s=>s.id===id);if(!slot)throw new Error('Scheduled entry not found.');
    if(!['error','attention'].includes(slot.status))throw new Error('Only entries that need attention can be retried.');
    delete slot.attempts;delete slot.retryAfter;delete slot.blockedRevision;await writeSlot(slot);return slot;
  })});
}catch(e){return failure(e);}}
