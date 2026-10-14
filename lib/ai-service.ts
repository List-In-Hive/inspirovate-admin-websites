import { assertProjectReady } from "./project-catalog";
import { ensureProjectSource } from "./publisher";
import { withLock, readArticles, writeArticles } from "./store";
import { saveArticleUnlocked } from "./service";
import { databaseConfigured } from "./database";
import { readGeneration, writeGeneration, readProfile } from "./postgres-store";
import { library } from "./content-store";
import { editorialContext } from "./knowledge";
import { reviewArticleUnlocked } from "./editorial";
import { articlePhotoUnlocked } from "./media";
import { createAIContent, openAIConfigured, contentModels } from "./openai";
import { generateDraft } from "./generation";
import { automaticTopic } from './automatic-content';
import { getSite } from './config';
import type { Slot } from './schedule-store';

export async function generateScheduledArticleUnlocked(slot: Slot) {
  const id=slot.generationId||slot.id;
  const existing=await readGeneration(id);
  // Preserve saved request identity when recovering an older paid result.
  // An approved topic plan (or a person's topic) takes precedence over automatic selection.
  return generateArticleUnlocked({id,topic:existing?.topic||slot.topic.trim()||automaticTopic(slot.publishAt),coverImage:existing?.coverImage||getSite().covers[0].id,coverAlt:existing?.coverAlt||getSite().covers[0].alt});
}
export async function generateArticle(input: unknown) {
  if (!databaseConfigured()) throw new Error("First connect Supabase in project Settings.");
  if (!openAIConfigured()) throw new Error("First add your OpenAI key to .env.local and restart the admin.");
  return withLock(() => generateArticleUnlocked(input));
}
export async function generateArticleUnlocked(input: unknown) {
  assertProjectReady(getSite(),true);
  await ensureProjectSource();
  const article = await generateDraft(input, {
    read: readGeneration, write: writeGeneration, profile: readProfile, articles: readArticles,
    generate: async(topic,profile,titles) => createAIContent(topic,profile,titles,undefined,await editorialContext(topic)), save: (input, id) => saveArticleUnlocked(input, undefined, id), model: contentModels(),
    slugs: async () => [...(await library()).map(a=>a.slug),...(await readArticles()).map(a=>a.slug)],
    titles: async () => (await readArticles()).map(a=>a.title),
  });
  if(article.commit)return article;
  try {
    return await reviewThenPhotos(article.id);
  }catch(e){
    const all=await readArticles();const saved=all.find(a=>a.id===article.id)!;
    saved.error=`Draft saved. Preparation needs attention: ${(e as Error).message}`;saved.revision++;saved.updatedAt=new Date().toISOString();await writeArticles(all);return saved;
  }
}
// Photos do not depend on the review outcome: a draft that needs attention still gets them,
// so the administrator reviews a complete article.
export async function reviewThenPhotos(id:string,deps={review:reviewArticleUnlocked,photos:articlePhotoUnlocked}){
  const {article:reviewed,review}=await deps.review(id);
  const prepared=await deps.photos(reviewed.id);
  if(!review.output?.ready)throw new Error(review.output?.remainingIssues.filter(i=>i.severity==='blocker').map(i=>i.message).join(' ')||'Editorial review needs attention.');
  return prepared;
}
