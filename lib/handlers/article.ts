import { databaseConfigured } from "@/lib/database";
import { slots, settings } from "@/lib/schedule-store";
import { assertLocal, failure, json, readBody } from "@/lib/http";
import { readArticles } from "@/lib/store";
import { saveArticle } from "@/lib/service";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertLocal(request); const { id } = await context.params; const data = (await readArticles()).find(a => a.id === id); if(data && databaseConfigured()) { const slot = (await slots()).find(s=>s.articleId===id); if(slot) data.schedule={publishAt:slot.publishAt,enabled:(await settings()).enabled}; } return data ? json({ data }) : json({ message: "Article not found" }, 404); } catch (e) { return failure(e); }
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try { assertLocal(request); const { id } = await context.params; return json({ data: await saveArticle(await readBody(request), id) }); } catch (e) { return failure(e); }
}
