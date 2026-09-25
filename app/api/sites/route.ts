import { assertLocal, failure, json } from "@/lib/http";
import { publicSite } from "@/lib/config";
export async function GET(request: Request) {
  try { assertLocal(request); return json({ data: [publicSite], total: 1 }); } catch (e) { return failure(e); }
}
