import { assertLocal, failure, json, readBody } from "@/lib/http";
import { readArticles } from "@/lib/store";
import { saveArticle } from "@/lib/service";

export async function GET(request: Request) {
  try { assertLocal(request); const data = await readArticles(); return json({ data, total: data.length }); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try { assertLocal(request); return json({ data: await saveArticle(await readBody(request)) }, 201); } catch (e) { return failure(e); }
}
