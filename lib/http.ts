import { ZodError } from "zod";
import { hostedRuntime } from './runtime';

export function assertLocal(request: Request) {
  // A forged local Host header must never grant access on a public deployment.
  if (hostedRuntime()) throw new Error('Hosted admin access is not configured yet.');
  const host = request.headers.get("host");
  if (host !== "127.0.0.1:3100" && host !== "localhost:3100") throw new Error("The admin is available only on localhost port 3100.");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Cross-site requests are not allowed.");
  if (request.method !== "GET") {
    if (request.headers.get("origin") !== `http://${host}`) throw new Error("Invalid request origin.");
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Expected JSON.");
  }
}
export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty request.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 200000) { await reader.cancel(); throw new Error("The article is too large."); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function failure(error: unknown) {
  let message = error instanceof ZodError ? error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") : error instanceof Error ? error.message : "The operation could not be completed";
  for (const value of [process.env.DATABASE_URL, process.env.OPENAI_API_KEY, process.env.GITHUB_PROJECTS_TOKEN, ...Object.entries(process.env).filter(([key])=>key.endsWith('_GITHUB_TOKEN')).map(([,value])=>value)]) {
    if (value) message = message.split(value).join("[redacted]");
  }
  message = message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[connection redacted]").replace(/sk-[a-zA-Z0-9_-]+/g, "[key redacted]");
  return json({ message }, 400);
}
