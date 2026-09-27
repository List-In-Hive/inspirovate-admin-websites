import { getSite } from "@/lib/config";
import { assertLocal, failure, json, readBody } from "@/lib/http";
import { withLock } from "@/lib/store";
import { databaseConfigured, query } from "@/lib/database";
import { settings,slots,ensureCalendar,updateSettings } from "@/lib/schedule-store";

export async function GET(request:Request){try{
  assertLocal(request);if(!databaseConfigured())return json({data:{configured:false}});
  await withLock(()=>ensureCalendar());
  const heartbeat=(await query("SELECT heartbeat FROM inspirovate.worker WHERE id=$1",[getSite().id])).rows[0]?.heartbeat;
  return json({data:{configured:true,settings:await settings(),slots:await slots(),heartbeat,workerActive:Boolean(heartbeat&&Date.now()-new Date(heartbeat).getTime()<20*60000)}});
}catch(e){return failure(e);}}
export async function PUT(request:Request){try{assertLocal(request);const body=await readBody(request);return json({data:await withLock(()=>updateSettings(body))});}catch(e){return failure(e);}}
