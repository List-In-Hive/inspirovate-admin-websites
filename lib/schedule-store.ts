import { assertProjectReady } from "./project-catalog";
import { getSite } from "./config";
import { randomUUID } from "node:crypto";
import { query } from "./database";
import { monthSlots, nextMonths, pacificToUTC } from "./calendar";
import { z } from "zod";
export type ScheduleSettings = { perMonth: number; enabled: boolean; latePolicy: 'review24h' | 'immediate' };
export type Slot = { id: string; month: string; index: number; publishAt: string; generateAt: string; topic: string; custom: boolean; status: 'planned' | 'review' | 'publishing' | 'published' | 'error'; generationId?: string; articleId?: string; generatedAt?: string; error?: string; updatedAt: string; revision: number; retryAfter?: string };
export async function settings(): Promise<ScheduleSettings> { return (await query("SELECT payload FROM inspirovate.schedules WHERE id=$1",[getSite().id])).rows[0].payload; }
export async function slots(): Promise<Slot[]> { return (await query("SELECT payload FROM inspirovate.slots WHERE site_id=$1 ORDER BY publish_at",[getSite().id])).rows.map(r=>r.payload); }
export async function writeSlot(s: Slot) {
  s.updatedAt=new Date().toISOString();s.revision++;
  const result = await query(`INSERT INTO inspirovate.slots(id,month,position,publish_at,payload,site_id) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET publish_at=excluded.publish_at,payload=excluded.payload WHERE inspirovate.slots.site_id=excluded.site_id`,[s.id,s.month,s.index,s.publishAt,JSON.stringify(s),getSite().id]);
  if(result.rowCount !== 1) throw new Error("Schedule ID belongs to another project.");
}
// Called under the application lock. Keep edited dates and slots already started.
export async function ensureCalendar(replan=false, now=new Date()) {
  const config=await settings();
  if(replan) await query("DELETE FROM inspirovate.slots WHERE site_id=$2 AND payload->>'status'='planned' AND payload->>'custom'='false' AND publish_at > $1",[now.toISOString(),getSite().id]);
  const existing=await slots();
  for(const month of nextMonths(now)) {
    const dates=monthSlots(month,config.perMonth);
    for(let index=0;index<dates.length;index++) {
      const date=dates[index];
      if(Date.parse(date.publishAt)<=now.getTime() || existing.some(s=>s.month===month&&s.index===index)) continue;
      await writeSlot({id:randomUUID(),month,index,...date,topic:'',custom:false,status:'planned',updatedAt:now.toISOString(),revision:0});
    }
  }
}
export async function updateSettings(input:unknown) {
  const parsed=z.object({perMonth:z.number().int().min(1).max(28),enabled:z.boolean(),latePolicy:z.enum(['review24h','immediate'])}).parse(input);
  if(parsed.enabled)assertProjectReady(getSite());
  const old=await settings();
  await query("UPDATE inspirovate.schedules SET payload=$1 WHERE id=$2",[JSON.stringify(parsed),getSite().id]);
  await ensureCalendar(old.perMonth!==parsed.perMonth);return parsed;
}
export async function updateSlot(id:string,input:unknown) {
  const parsed=z.object({revision:z.number().int(),localTime:z.string()}).parse(input);
  const slot=(await slots()).find(s=>s.id===id);if(!slot)throw new Error('Scheduled entry not found.');
  if(slot.revision!==parsed.revision)throw new Error('The schedule has changed. Refresh the page.');
  if(slot.status==='publishing'||slot.status==='published')throw new Error('The article has already been sent to the website.');
  const publishAt=pacificToUTC(parsed.localTime);
  if(Date.parse(publishAt)<=Date.now())throw new Error('Choose a future date.');
  slot.publishAt=publishAt;slot.generateAt=new Date(Date.parse(publishAt)-86400000).toISOString();slot.custom=true;
  await writeSlot(slot);return slot;
}
