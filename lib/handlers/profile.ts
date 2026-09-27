import { getSite } from "@/lib/config";
import { assertLocal, failure, json, readBody } from "@/lib/http";
import { profileSchema, defaultProfile } from "@/lib/profile";
import { readProfile, writeProfile } from "@/lib/postgres-store";
import { databaseConfigured } from "@/lib/database";
import { withLock } from "@/lib/store";

export async function GET(request: Request) {
  try { assertLocal(request); return json({ data: databaseConfigured() ? await readProfile() : getSite().id==='flowers' ? defaultProfile : profileSchema.parse({ name:getSite().brand, facts:getSite().description, audience:'Readers of this business website.', tone:'Clear, useful English. Do not invent facts.' }) }); } catch (e) { return failure(e); }
}
export async function PUT(request: Request) {
  try {
    assertLocal(request); if (!databaseConfigured()) throw new Error("Connect Supabase first.");
    const data = profileSchema.parse(await readBody(request));
    await withLock(() => writeProfile(data)); return json({ data });
  } catch (e) { return failure(e); }
}
