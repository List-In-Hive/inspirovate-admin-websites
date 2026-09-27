import { z } from "zod";
import { assertLocal, failure, json, readBody } from "@/lib/http";
import { actOnArticle } from "@/lib/service";

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    assertLocal(request); const { id, action } = await context.params;
    const { revision } = z.object({ revision: z.number().int() }).parse(await readBody(request));
    return json({ data: await actOnArticle(id, action, revision) });
  } catch (e) { return failure(e); }
}
