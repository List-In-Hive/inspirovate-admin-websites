import { assertLocal,failure,json,readBody } from "@/lib/http";
import { withLock } from "@/lib/store";
import { updateSlot } from "@/lib/schedule-store";

export async function PUT(request:Request,context:{params:Promise<{id:string}>}){try{assertLocal(request);const {id}=await context.params;const body=await readBody(request);return json({data:await withLock(()=>updateSlot(id,body))});}catch(e){return failure(e);}}
