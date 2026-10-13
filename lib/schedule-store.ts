import { assertProjectReady } from "./project-catalog";
import { getSite } from "./config";
import { randomUUID } from "node:crypto";
import { query } from "./database";
import { cycleSlots, cycleStarts, remainingIndexes, scheduleDefaults, zonedToUTC, TIME_ZONE } from "./calendar";
import { DateTime } from "luxon";
import { z } from "zod";
export const scheduleSchema = z.object({
  perMonth: z.number().int().min(1).max(28), enabled: z.boolean(), latePolicy: z.enum(['review24h', 'immediate']),
  cycleStartDay: z.number().int().min(1).max(28).default(scheduleDefaults.cycleStartDay),
  timeZone: z.string().min(1).max(100).refine(zone => DateTime.local().setZone(zone).isValid, 'Choose a valid time zone, for example Europe/London.').default(scheduleDefaults.timeZone),
  publishHour: z.number().int().min(0).max(23).default(scheduleDefaults.publishHour),
  planLeadDays: z.number().int().min(1).max(25).default(scheduleDefaults.planLeadDays),
  approvalDays: z.number().int().min(0).max(10).default(scheduleDefaults.approvalDays),
}).refine(s => s.approvalDays < s.planLeadDays, { message: 'Approval days must be shorter than the planning lead time.', path: ['approvalDays'] });
export type ScheduleSettings = z.infer<typeof scheduleSchema>;
export type TopicPlan = { readerQuestion: string; primaryKeyword: string; searchIntent: string; angle: string };
export type Slot = {
  id: string; month: string; index: number; publishAt: string; generateAt: string; planAt?: string; topic: string; custom: boolean;
  status: 'planned' | 'review' | 'publishing' | 'published' | 'error' | 'attention';
  plan?: TopicPlan; planStatus?: 'planning' | 'proposed' | 'approved' | 'failed'; planStartedAt?: string; planApproveAt?: string;
  generationId?: string; articleId?: string; generatedAt?: string; error?: string; updatedAt: string; revision: number;
  retryAfter?: string; attempts?: number; blockedRevision?: number;
};
export async function settings(): Promise<ScheduleSettings> { return scheduleSchema.parse((await query("SELECT payload FROM inspirovate.schedules WHERE id=$1",[getSite().id])).rows[0].payload); }
export async function slots(): Promise<Slot[]> { return (await query("SELECT payload FROM inspirovate.slots WHERE site_id=$1 ORDER BY publish_at",[getSite().id])).rows.map(r=>r.payload); }
export async function writeSlot(s: Slot) {
  s.updatedAt=new Date().toISOString();s.revision++;
  const result = await query(`INSERT INTO inspirovate.slots(id,month,position,publish_at,payload,site_id) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET publish_at=excluded.publish_at,payload=excluded.payload WHERE inspirovate.slots.site_id=excluded.site_id`,[s.id,s.month,s.index,s.publishAt,JSON.stringify(s),getSite().id]);
  if(result.rowCount !== 1) throw new Error("Schedule ID belongs to another project.");
}
// Older calendars used monthly keys (YYYY-MM); cycles use their start date (YYYY-MM-DD).
const legacy = (s: Slot) => s.month.length === 7;
// Called under the application lock. Keep edited dates, chosen topics and slots already started.
export async function ensureCalendar(replan=false, now=new Date()) {
  const config=await settings();
  const unstarted = "payload->>'status'='planned' AND payload->>'custom'='false' AND payload->>'articleId' IS NULL AND publish_at > $1";
  if(replan) await query(`DELETE FROM inspirovate.slots WHERE site_id=$2 AND ${unstarted} AND COALESCE(payload->>'planStatus','')<>'planning'`,[now.toISOString(),getSite().id]);
  await query(`DELETE FROM inspirovate.slots WHERE site_id=$2 AND length(month)=7 AND ${unstarted}`,[now.toISOString(),getSite().id]);
  const existing=await slots();
  for(const start of cycleStarts(now,config)) {
    const cycle=cycleSlots(start,config);const end=start.plus({months:1});
    const taken=existing.filter(s=>legacy(s)&&Date.parse(s.publishAt)>=start.toMillis()&&Date.parse(s.publishAt)<end.toMillis()).map(s=>s.publishAt);
    for(const index of remainingIndexes(cycle.dates,taken)) {
      const date=cycle.dates[index];
      if(Date.parse(date.publishAt)<=now.getTime() || existing.some(s=>s.month===cycle.key&&s.index===index)) continue;
      await writeSlot({id:randomUUID(),month:cycle.key,index,...date,planAt:cycle.planAt,topic:'',custom:false,status:'planned',updatedAt:now.toISOString(),revision:0});
    }
  }
}
export async function updateSettings(input:unknown) {
  const parsed=scheduleSchema.parse(input);
  if(parsed.enabled)assertProjectReady(getSite());
  const old=await settings();
  await query("UPDATE inspirovate.schedules SET payload=$1 WHERE id=$2",[JSON.stringify(parsed),getSite().id]);
  const timing=(['perMonth','cycleStartDay','timeZone','publishHour','planLeadDays','approvalDays'] as const).some(key=>old[key]!==parsed[key]);
  await ensureCalendar(timing);return parsed;
}
export async function updateSlot(id:string,input:unknown) {
  const parsed=z.object({revision:z.number().int(),localTime:z.string().optional(),timeZone:z.string().min(1).max(100).default(TIME_ZONE),topic:z.string().trim().min(5).max(2000).optional()}).parse(input);
  const slot=(await slots()).find(s=>s.id===id);if(!slot)throw new Error('Scheduled entry not found.');
  if(slot.revision!==parsed.revision)throw new Error('The schedule has changed. Refresh the page.');
  if(slot.status==='publishing'||slot.status==='published')throw new Error('The article has already been sent to the website.');
  if(parsed.topic!==undefined){
    if(slot.articleId)throw new Error('The draft already exists. Edit the article instead.');
    // A topic written by a person replaces the AI proposal and counts as approved.
    slot.topic=parsed.topic;slot.planStatus='approved';delete slot.plan;delete slot.planApproveAt;
  }
  if(parsed.localTime!==undefined){
    const publishAt=zonedToUTC(parsed.localTime,parsed.timeZone);
    if(Date.parse(publishAt)<=Date.now())throw new Error('Choose a future date.');
    slot.publishAt=publishAt;slot.custom=true;
    // Keep the batch preparation time, but never prepare later than 24 hours before publication.
    slot.generateAt=new Date(Math.min(Date.parse(slot.generateAt),Date.parse(publishAt)-86400000)).toISOString();
  }
  await writeSlot(slot);return slot;
}
export function cycleOf(all:Slot[],slot:Slot){return all.filter(s=>s.month===slot.month&&!s.articleId);}
export async function approveCycle(id:string){
  const all=await slots();const slot=all.find(s=>s.id===id);if(!slot)throw new Error('Scheduled entry not found.');
  const proposed=cycleOf(all,slot).filter(s=>s.planStatus==='proposed');
  if(!proposed.length)throw new Error('There is no proposed topic plan to approve.');
  for(const s of proposed){s.planStatus='approved';delete s.planApproveAt;await writeSlot(s);}
  return proposed.length;
}
