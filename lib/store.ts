import { databaseConfigured, withDatabaseLock, query } from "./database";
import { readDatabaseArticles, writeDatabaseArticles } from "./postgres-store";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir, getSite, withProject } from "./config";
import { Article } from "./article";

export async function readArticles(): Promise<Article[]> {
  if (databaseConfigured()) return readDatabaseArticles();
  return (await readLocalArticles()).filter(a => a.siteId === getSite().id);
}
async function readLocalArticles(): Promise<Article[]> {
  try { return JSON.parse(await readFile(path.join(dataDir, "articles.json"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
}
export async function writeArticles(articles: Article[]) {
  if (articles.some(a => a.siteId !== getSite().id)) throw new Error("Article belongs to another project.");
  if (databaseConfigured()) return writeDatabaseArticles(articles);
  const other = (await readLocalArticles()).filter(a => a.siteId !== getSite().id);
  if(articles.some(a => other.some(b => a.id === b.id))) throw new Error("Article ID belongs to another project.");
  articles = [...other, ...articles];
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temp = path.join(dataDir, `${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(articles, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path.join(dataDir, "articles.json"));
}
// Serialize mutations across requests and Next.js workers. Never steal a lock:
// after a crash, the owner checks that the server stopped before removing it.
export async function withLock<T>(work: () => Promise<T>): Promise<T> {
  if (databaseConfigured()) return withDatabaseLock(async()=>{
    const row=(await query('SELECT payload,archived_at FROM inspirovate.projects WHERE id=$1',[getSite().id])).rows[0];
    if(row?.archived_at)throw new Error('This project was removed. Restore it from Projects before making changes.');
    return row ? withProject(row.payload,work) : work();
  });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = path.join(dataDir, "operation.lock");
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    throw new Error("Another operation is already running. Try again in a few seconds. After a crash, see the recovery section in README.");
  }
  try { await lock.writeFile(String(process.pid)); return await work(); }
  finally { await lock.close(); await unlink(lockPath); }
}
