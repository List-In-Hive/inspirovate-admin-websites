import { assertLocal, failure, json } from "@/lib/http";
import { databaseConfigured, query } from "@/lib/database";
import { openAIConfigured, openAIModel, checkOpenAI } from "@/lib/openai";

async function status(checkKey: boolean) {
  let database = 'local'; let databaseError: string | undefined;
  if (databaseConfigured()) {
    try { await query('SELECT 1'); database = 'connected'; }
    catch (e) { database = 'error'; databaseError = (e as Error).message; }
  }
  let openai = openAIConfigured() ? 'configured' : 'missing'; let openaiError: string | undefined;
  if (checkKey && openAIConfigured()) {
    try { await checkOpenAI(); openai = 'connected'; }
    catch (e) { openai = 'error'; openaiError = (e as Error).message; }
  }
  return { database, databaseError, openai, openaiError, model: openAIModel() };
}
export async function GET(request: Request) { try { assertLocal(request); return json({ data: await status(false) }); } catch (e) { return failure(e); } }
export async function POST(request: Request) { try { assertLocal(request); return json({ data: await status(true) }); } catch (e) { return failure(e); } }
