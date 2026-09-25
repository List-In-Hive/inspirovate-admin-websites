import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "./config";
import { Article } from "./article";

export async function readArticles(): Promise<Article[]> {
  try { return JSON.parse(await readFile(path.join(dataDir, "articles.json"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
}
export async function writeArticles(articles: Article[]) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temp = path.join(dataDir, `${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(articles, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path.join(dataDir, "articles.json"));
}
// Serialize mutations across requests and Next.js workers. Never steal a lock:
// after a crash, the owner checks that the server stopped before removing it.
export async function withLock<T>(work: () => Promise<T>): Promise<T> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = path.join(dataDir, "operation.lock");
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    throw new Error("Уже выполняется другая операция. Повторите через несколько секунд. После аварийного завершения см. раздел восстановления в README.");
  }
  try { await lock.writeFile(String(process.pid)); return await work(); }
  finally { await lock.close(); await unlink(lockPath); }
}
