import { AsyncLocalStorage } from "node:async_hooks";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { constants, readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { z } from "zod";
import { inputSchema } from "./article";
import { dataDir } from "./config";
import { projects } from "./projects";
import { defaultProfile } from "./profile";

const session = new AsyncLocalStorage<PoolClient>();
const globals = globalThis as typeof globalThis & { adminPool?: Pool; adminDatabaseReady?: Promise<void> };
export const databaseConfigured = () => Boolean(process.env.DATABASE_URL?.trim());
export const databaseMessage = "Could not connect to Supabase. Check DATABASE_URL, the password and Session pooler (5432) in .env.local, then restart the admin.";
export function connectionOptions(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(databaseMessage); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password || url.port === '6543') throw new Error(databaseMessage);
  // Never let URL SSL flags silently override certificate verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  const supabaseHost = url.hostname.endsWith('.pooler.supabase.com') || (url.hostname.startsWith('db.') && url.hostname.endsWith('.supabase.co'));
  const ca = supabaseHost ? [...rootCertificates, readFileSync(path.join(process.cwd(), 'certs/supabase-prod-ca-2021.crt'), 'utf8')] : undefined;
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 20000, query_timeout: 15000, application_name: 'inspirovate-admin' };
}
function pool() {
  if (!databaseConfigured()) throw new Error("Add DATABASE_URL to .env.local and restart the admin.");
  if (!globals.adminPool) {
    globals.adminPool = new Pool(connectionOptions(process.env.DATABASE_URL!));
    globals.adminPool.on('error', () => { /* Errors are returned safely by the next request. */ });
  }
  return globals.adminPool;
}
const storedArticle = inputSchema.extend({
  id: z.string().min(1), siteId: z.string().min(1), revision: z.number().int().positive(),
  status: z.enum(['draft', 'approved', 'deploying', 'published', 'failed']), updatedAt: z.iso.datetime({ offset: true }),
}).passthrough();

export async function initializeDatabase() {
  if (!globals.adminDatabaseReady) globals.adminDatabaseReady = (async () => {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(3100, 1)');
      await client.query(await readFile(path.join(process.cwd(), 'db/001-initial.sql'), 'utf8'));
      await client.query(await readFile(path.join(process.cwd(), 'db/002-project-isolation.sql'), 'utf8'));
      await client.query(await readFile(path.join(process.cwd(), 'db/003-content-workflow.sql'), 'utf8'));
      await client.query(await readFile(path.join(process.cwd(), 'db/004-project-catalog.sql'), 'utf8'));
      const imported = await client.query("SELECT id FROM inspirovate.migrations WHERE id = '001-local-import'");
      if (!imported.rowCount) {
        let local = '[]'; let hasLocal = false;
        try { local = await readFile(path.join(dataDir, 'articles.json'), 'utf8'); hasLocal = true; }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        const articles = z.array(storedArticle).parse(JSON.parse(local));
        if (articles.length) {
          await mkdir(dataDir, { recursive: true, mode: 0o700 });
          try { await copyFile(path.join(dataDir, 'articles.json'), path.join(dataDir, 'articles.before-supabase.json'), constants.COPYFILE_EXCL); }
          catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
        }
        for (const a of articles) await client.query('INSERT INTO inspirovate.articles(id, slug, payload,site_id) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING', [a.id, a.slug, JSON.stringify(a),a.siteId]);
        await client.query("INSERT INTO inspirovate.profile(id,payload) VALUES ('flowers',$1) ON CONFLICT DO NOTHING", [JSON.stringify(defaultProfile)]);
        if (hasLocal) await client.query("INSERT INTO inspirovate.migrations(id) VALUES ('001-local-import')");
      }
      for (const project of projects) {
        await client.query('INSERT INTO inspirovate.projects(id,repository,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[project.id,project.repository,JSON.stringify(project)]);
        const profile = project.id === 'flowers' ? defaultProfile : { name: project.brand, facts: project.description, audience: 'Readers of this business website.', tone: 'Clear, useful English. Do not invent facts.' };
        await client.query('INSERT INTO inspirovate.profile(id,payload) VALUES ($1,$2) ON CONFLICT DO NOTHING',[project.id,JSON.stringify(profile)]);
        await client.query('INSERT INTO inspirovate.schedules(id,payload) VALUES ($1,$2) ON CONFLICT DO NOTHING',[project.id,JSON.stringify({perMonth:4,enabled:false,latePolicy:'review24h'})]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }
  })().catch(() => { globals.adminDatabaseReady = undefined; throw new Error(databaseMessage); });
  return globals.adminDatabaseReady;
}
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
  await initializeDatabase();
  try { return await (session.getStore() || pool()).query<T>(sql, values); }
  catch { throw new Error("The database operation failed. Check the Supabase connection. Storage has not switched back to local files."); }
}
export async function withDatabaseLock<T>(work: () => Promise<T>): Promise<T> {
  await initializeDatabase();
  if (session.getStore()) throw new Error("Another operation is already running.");
  let client: PoolClient;
  try { client = await pool().connect(); } catch { throw new Error(databaseMessage); }
  let locked = false;
  try {
    locked = Boolean((await client.query('SELECT pg_try_advisory_lock(3100,2) AS locked')).rows[0].locked);
    if (!locked) throw new Error("Another operation is already running. Wait for it to finish and try again.");
    return await session.run(client, work);
  } finally {
    // Discard the session if unlocking fails: never return a locked connection to the pool.
    let broken = false;
    if (locked) try { await client.query('SELECT pg_advisory_unlock(3100,2)'); } catch { broken = true; }
    client.release(broken);
  }
}
export async function closeDatabase() { await globals.adminPool?.end(); globals.adminPool = undefined; globals.adminDatabaseReady = undefined; }
