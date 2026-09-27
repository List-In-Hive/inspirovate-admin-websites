import { assertLocal, failure, json, readBody } from "@/lib/http";
import { generateArticle } from "@/lib/ai-service";
import { readGenerations } from "@/lib/postgres-store";
import { databaseConfigured } from "@/lib/database";

export async function GET(request: Request) {
  try { assertLocal(request); const data = databaseConfigured() ? (await readGenerations()).map(({ output, ...g }) => ({ ...g, outputAvailable: Boolean(output) })) : []; return json({ data, total: data.length }); }
  catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try { assertLocal(request); return json({ data: await generateArticle(await readBody(request)) }, 201); }
  catch (e) { return failure(e); }
}
