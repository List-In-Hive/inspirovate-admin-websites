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
  const date = DateTime.fromISO(value, { zone: TIME_ZONE });
  if (!date.isValid || date.toFormat("yyyy-MM-dd'T'HH:mm") !== value) throw new Error("This local time does not exist. Choose a different time.");
  if (date.getPossibleOffsets().length > 1) throw new Error("This time occurs twice when daylight saving time ends. Choose a time after 2:00 AM.");
  return date.toUTC().toISO()!;
}
export function pacificInput(value: string) { return DateTime.fromISO(value).setZone(TIME_ZONE).toFormat("yyyy-MM-dd'T'HH:mm"); }
export function nextMonths(now = new Date()) { const d=DateTime.fromJSDate(now).setZone(TIME_ZONE); return [d.toFormat('yyyy-MM'),d.plus({months:1}).toFormat('yyyy-MM')]; }
export function reviewDeadline(publishAt: string, generatedAt: string) {
  return new Date(Math.max(Date.parse(publishAt), Date.parse(generatedAt) + 86400000)).toISOString();
}
