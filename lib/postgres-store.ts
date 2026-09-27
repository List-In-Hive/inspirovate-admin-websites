import { getSite } from "./config";
import type { Article } from "./article";
import { profileSchema, type Profile } from "./profile";
import type { z } from 'zod';
import { query } from "./database";

export async function readDatabaseArticles(): Promise<Article[]> {
  return (await query('SELECT payload FROM inspirovate.articles WHERE site_id=$1 ORDER BY updated_at DESC',[getSite().id])).rows.map(r => r.payload);
}
export async function writeDatabaseArticles(articles: Article[]) {
  // One statement is atomic; every caller holds the shared application lock.
  const result = await query(`INSERT INTO inspirovate.articles (id,site_id,slug,payload,updated_at)
    SELECT a->>'id', $2, a->>'slug', a, (a->>'updatedAt')::timestamptz FROM jsonb_array_elements($1::jsonb) a
    ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,payload=excluded.payload,updated_at=excluded.updated_at WHERE inspirovate.articles.site_id=excluded.site_id`, [JSON.stringify(articles),getSite().id]);
  if(result.rowCount !== articles.length) throw new Error("Article ID belongs to another project.");
}
export async function readProfile(): Promise<Profile> { return profileSchema.parse((await query("SELECT payload FROM inspirovate.profile WHERE id=$1",[getSite().id])).rows[0].payload); }
export async function writeProfile(profile: z.input<typeof profileSchema>) { await query("UPDATE inspirovate.profile SET payload=$1 WHERE id=$2", [JSON.stringify(profileSchema.parse(profile)),getSite().id]); }
export type Generation = {
  id: string; kind?: 'revision'; sourceRevision?: number; topic: string; coverImage: string; coverAlt: string; model: string;
  status: 'generating' | 'generated' | 'succeeded' | 'failed'; createdAt: string;
  articleId?: string; output?: { title: string; slug: string; description: string; body: string };
  responseId?: string; inputTokens?: number; outputTokens?: number; error?: string;
};
export async function readGeneration(id: string): Promise<Generation | undefined> { return (await query('SELECT payload FROM inspirovate.generations WHERE id=$1 AND site_id=$2',[id,getSite().id])).rows[0]?.payload; }
export async function writeGeneration(g: Generation) { const result = await query('INSERT INTO inspirovate.generations(id,payload,site_id) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE inspirovate.generations.site_id=excluded.site_id', [g.id,JSON.stringify(g),getSite().id]); if(result.rowCount !== 1) throw new Error("Generation ID belongs to another project."); }
export async function readGenerations(): Promise<Generation[]> { return (await query('SELECT payload FROM inspirovate.generations WHERE site_id=$1 ORDER BY created_at DESC LIMIT 100',[getSite().id])).rows.map(r=>r.payload); }
