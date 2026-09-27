import { getSite } from "@/lib/config";
import { assertLocal, failure, json, readBody } from "@/lib/http";
import { withLock } from "@/lib/store";
import { databaseConfigured, query } from "@/lib/database";
import { settings,slots,ensureCalendar,updateSettings } from "@/lib/schedule-store";
import { automaticWorkerActive } from '@/lib/worker-status';

export async function GET(request:Request){try{
  assertLocal(request);if(!databaseConfigured())return json({data:{configured:false}});
  await withLock(()=>ensureCalendar());
  const worker=(await query("SELECT heartbeat,automatic_heartbeat,last_trigger FROM inspirovate.worker WHERE id=$1",[getSite().id])).rows[0];
  return json({data:{configured:true,settings:await settings(),slots:await slots(),heartbeat:worker?.heartbeat,automaticHeartbeat:worker?.automatic_heartbeat,lastTrigger:worker?.last_trigger,workerActive:automaticWorkerActive(worker?.automatic_heartbeat)}});
}catch(e){return failure(e);}}
export async function PUT(request:Request){try{assertLocal(request);const body=await readBody(request);return json({data:await withLock(()=>updateSettings(body))});}catch(e){return failure(e);}}
