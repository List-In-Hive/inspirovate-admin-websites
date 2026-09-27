import { z } from "zod";
import type { Article } from "./article";
import { inputSchema } from "./article";
import type { Generation } from "./postgres-store";
import type { Profile } from "./profile";
import { AUTOMATIC_TOPIC } from './automatic-content';

export const generationInput = z.object({
  id: z.uuid(), topic: z.string().trim().min(5).max(2000).default(AUTOMATIC_TOPIC),
  coverImage: inputSchema.shape.coverImage, coverAlt: inputSchema.shape.coverAlt,
});
type Dependencies = {
  read: (id: string) => Promise<Generation | undefined>;
  write: (g: Generation) => Promise<void>;
  articles: () => Promise<Article[]>;
  profile: () => Promise<Profile>;
  titles: () => Promise<string[]>;
  slugs?: () => Promise<string[]>;
  generate: (topic: string, p: Profile, titles: string[]) => Promise<Pick<Generation, 'output' | 'responseId' | 'inputTokens' | 'outputTokens'>>;
  save: (input: unknown, creationId: string) => Promise<Article>;
  model: string;
};
// Caller holds the database session lock. Persist output before creating the draft,
// so a retry after storage/validation failure never repeats the paid API request.
export async function generateDraft(input: unknown, d: Dependencies) {
  const request = generationInput.parse(input);
  let job = await d.read(request.id);
  if (job && (job.topic !== request.topic || job.coverImage !== request.coverImage || job.coverAlt !== request.coverAlt)) throw new Error("Start a new request for a different topic.");
  if (job?.status === 'succeeded') {
    const article = (await d.articles()).find(a => a.id === job!.articleId);
    if (!article) throw new Error("The draft referenced in the history was not found. Check the database.");
    return article;
  }
  if (job && !job.output) throw new Error("This request was already sent. Check the history; start a new request for another paid generation.");
  if (!job) {
    const profile = await d.profile(); const titles = await d.titles();
    job = { ...request, model: d.model, status: 'generating', createdAt: new Date().toISOString() };
    await d.write(job);
    try {
      Object.assign(job, await d.generate(request.topic, profile, titles));
      if (!job.output) throw new Error("OpenAI did not return any content.");
      job.status = 'generated'; await d.write(job);
    } catch (e) {
      job.status = 'failed'; job.error = (e as Error).message;
      await d.write(job); throw e;
    }
  }
  try {
    const output = job.output!;
    const articleInput = inputSchema.parse({ ...output, coverImage: job.coverImage, coverAlt: job.coverAlt, publishedAt: job.createdAt });
    // Keep human-readable URLs. Only add a small sequential suffix when the exact slug is taken.
    const existing = await d.articles();
    articleInput.slug = availableSlug(articleInput.slug,d.slugs ? await d.slugs() : existing.map(a=>a.slug));
    const article = (await d.articles()).find(a => a.id === job!.id) || await d.save(articleInput, job.id);
    job.articleId = article.id; job.status = 'succeeded'; delete job.error; await d.write(job);
    return article;
  } catch (e) {
    job.error = "Content was received, but the draft was not saved. Retry this request to save it without generating again.";
    await d.write(job); throw e;
  }
}

export function availableSlug(proposed:string,taken:string[]){
 const base=proposed.slice(0,100).replace(/-$/,'');const used=new Set(taken);
 if(!used.has(base))return base;
 for(let index=2;index<10000;index++){const suffix=`-${index}`;const candidate=base.slice(0,100-suffix.length).replace(/-$/,'')+suffix;if(!used.has(candidate))return candidate;}
 throw new Error('Choose a more specific article URL.');
}
