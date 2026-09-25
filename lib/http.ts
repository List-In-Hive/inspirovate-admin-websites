import { ZodError } from "zod";

export function assertLocal(request: Request) {
  const host = request.headers.get("host");
  if (host !== "127.0.0.1:3100" && host !== "localhost:3100") throw new Error("Админка доступна только локально на порту 3100.");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Запрос с другого сайта запрещён.");
  if (request.method !== "GET") {
    if (request.headers.get("origin") !== `http://${host}`) throw new Error("Некорректный источник запроса.");
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Ожидается JSON.");
  }
}
export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Пустой запрос.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 200000) { await reader.cancel(); throw new Error("Статья слишком большая."); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function failure(error: unknown) {
  const message = error instanceof ZodError ? error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") : error instanceof Error ? error.message : "Не удалось выполнить операцию";
  return json({ message }, 400);
}
