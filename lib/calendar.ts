import { DateTime } from "luxon";
export const TIME_ZONE = "America/Los_Angeles";
export function monthSlots(month: string, count: number) {
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isInteger(count) || count < 1 || count > 28) throw new Error("Choose 1 to 28 articles and enter the month as YYYY-MM.");
  const first = DateTime.fromISO(`${month}-01`, { zone: TIME_ZONE });
  if (!first.isValid) throw new Error("Invalid month.");
  return Array.from({ length: count }, (_, index) => {
    const publish = first.set({ day: 1 + Math.floor(index * first.daysInMonth! / count), hour: 8 });
    return { publishAt: publish.toUTC().toISO()!, generateAt: publish.minus({ hours: 24 }).toUTC().toISO()! };
  });
}
export function pacificToUTC(value: string) {
  return zonedToUTC(value, TIME_ZONE);
}
export function zonedToUTC(value: string, timeZone: string) {
  const date = DateTime.fromISO(value, { zone: timeZone });
  if (!date.isValid || date.toFormat("yyyy-MM-dd'T'HH:mm") !== value) throw new Error("This local time does not exist. Choose a different time.");
  if (date.getPossibleOffsets().length > 1) throw new Error("This time occurs twice when daylight saving time ends. Choose an unambiguous time.");
  return date.toUTC().toISO()!;
}
export function pacificInput(value: string) { return DateTime.fromISO(value).setZone(TIME_ZONE).toFormat("yyyy-MM-dd'T'HH:mm"); }
export function zonedInput(value: string, timeZone: string) { return DateTime.fromISO(value).setZone(timeZone).toFormat("yyyy-MM-dd'T'HH:mm"); }
export function browserTimeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
export function localDateTime(value: string) { return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); }
export function nextMonths(now = new Date()) { const d=DateTime.fromJSDate(now).setZone(TIME_ZONE); return [d.toFormat('yyyy-MM'),d.plus({months:1}).toFormat('yyyy-MM')]; }
export function reviewDeadline(publishAt: string, generatedAt: string) {
  return new Date(Math.max(Date.parse(publishAt), Date.parse(generatedAt) + 86400000)).toISOString();
}

// A project's publishing cycle runs from its start day to the same day next month (days 1–28 exist in every month).
export const scheduleDefaults = { perMonth: 4, enabled: false, latePolicy: 'review24h' as const, cycleStartDay: 1, timeZone: TIME_ZONE, publishHour: 8, planLeadDays: 10, approvalDays: 3 };
export function defaultSchedule(now = new Date()) {
  return { ...scheduleDefaults, cycleStartDay: Math.min(DateTime.fromJSDate(now).setZone(TIME_ZONE).day, 28) };
}
export type CycleSettings = Pick<typeof scheduleDefaults, 'perMonth' | 'cycleStartDay' | 'timeZone' | 'publishHour' | 'planLeadDays' | 'approvalDays'>;
export function cycleStarts(now: Date, s: Pick<CycleSettings, 'cycleStartDay' | 'timeZone'>) {
  const local = DateTime.fromJSDate(now).setZone(s.timeZone);
  let start = local.startOf('day').set({ day: s.cycleStartDay });
  if (local.day < s.cycleStartDay) start = start.minus({ months: 1 });
  return [start, start.plus({ months: 1 })];
}
export function cycleSlots(start: DateTime, s: CycleSettings) {
  if (!Number.isInteger(s.perMonth) || s.perMonth < 1 || s.perMonth > 28) throw new Error("Choose 1 to 28 articles per cycle.");
  const days = start.plus({ months: 1 }).diff(start, 'days').days;
  const planAt = start.minus({ days: s.planLeadDays });
  // Drafts for the whole cycle are prepared together once the topic plan has had time for review.
  const generateAt = planAt.plus({ days: s.approvalDays }).toUTC().toISO()!;
  return {
    key: start.toFormat('yyyy-MM-dd'), planAt: planAt.toUTC().toISO()!,
    dates: Array.from({ length: s.perMonth }, (_, index) => ({
      publishAt: start.plus({ days: Math.floor(index * days / s.perMonth) }).set({ hour: s.publishHour, minute: 0 }).toUTC().toISO()!, generateAt,
    })),
  };
}
// Older monthly slots that already hold drafts take the nearest date of the new cycle.
export function remainingIndexes(dates: { publishAt: string }[], taken: string[]) {
  const free = new Set(dates.map((_, index) => index));
  for (const publishAt of taken) {
    let best = -1;
    for (const index of free) if (best < 0 || Math.abs(Date.parse(dates[index].publishAt) - Date.parse(publishAt)) < Math.abs(Date.parse(dates[best].publishAt) - Date.parse(publishAt))) best = index;
    if (best >= 0) free.delete(best);
  }
  return [...free];
}
