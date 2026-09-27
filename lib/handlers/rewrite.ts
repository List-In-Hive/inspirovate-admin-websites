import { assertLocal,failure,json,readBody } from "@/lib/http";
import { rewriteArticle } from "@/lib/rewrite";

export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{assertLocal(request);const {id}=await context.params;return json({data:await rewriteArticle(id,await readBody(request))});}catch(e){return failure(e);}}
