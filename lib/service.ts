import { assertProjectReady } from "./project-catalog";
import { publishImmediately } from "./publish-now";
import { slots,writeSlot } from "./schedule-store";
import { databaseConfigured } from "./database";
import { reviewArticleUnlocked } from "./editorial";
import { mediaId } from "./media-path";
import { getSite } from "./config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Article, inputSchema, publicationHash, assertPublishable } from "./article";
import { readArticles, writeArticles, withLock } from "./store";
import { commitArticle, pushArticle, validateAgainstRepo, verifyPublication } from "./publisher";

export async function saveArticle(input: unknown, id?: string) {
  return withLock(() => saveArticleUnlocked(input, id));
}
// Internal helper: caller must hold withLock for the entire mutation.
export async function saveArticleUnlocked(input: unknown, id?: string, creationId?: string) {
    if(getSite().managed)assertProjectReady(getSite());
    const parsed = inputSchema.parse(input);
    const articles = await readArticles();
    const current = id ? articles.find(a => a.id === id) : undefined;
    if (id && !current) throw new Error("Article not found.");
    if (current) {
      const { revision } = z.object({ revision: z.number().int() }).parse(input);
      if (current.revision !== revision) throw new Error("The article changed in another window. Refresh the page.");
      if (current.commit || current.status === "deploying") throw new Error("The submitted article is locked. Use Git to edit published content for now.");
    }
    if (articles.some(a => a.slug === parsed.slug && a.id !== id)) throw new Error("This URL is already used by another draft.");
    const article: Article = { ...parsed, id: id || creationId || randomUUID(), siteId: getSite().id, status: "draft", lastAIRequest: current?.lastAIRequest, revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString() };
    await validateAgainstRepo(article);
    await writeArticles([...articles.filter(a => a.id !== id), article]);
    return article;
}
export async function actOnArticle(id: string, action: string, revision: number) {
  return withLock(() => actOnArticleUnlocked(id, action, revision));
}
export async function actOnArticleUnlocked(id: string, action: string, revision: number): Promise<Article> {
    let articles = await readArticles();
    const found = articles.find(a => a.id === id);
    if (!found) throw new Error("Article not found.");
    let article:Article=found;
    if (revision !== article.revision) throw new Error("The article version has changed. Refresh the page.");
    if(["publish-now","publish"].includes(action)&&(getSite().managed||getSite().localOnly))assertProjectReady(getSite());
    if(action==='publish-now')return publishImmediately(article,{
      now:Date.now,
      save:async saved=>writeArticles((await readArticles()).map(a=>a.id===saved.id?saved:a)),
      approve:saved=>actOnArticleUnlocked(saved.id,'approve',saved.revision),
      publish:approved=>actOnArticleUnlocked(approved.id,'publish',approved.revision),
      completeSchedule:async(sent,when)=>{
        if(!databaseConfigured())return;
        const slot=(await slots()).find(s=>s.articleId===sent.id);if(!slot)return;
        slot.publishAt=when;slot.generateAt=new Date(Math.min(Date.parse(slot.generateAt),Date.parse(when))).toISOString();slot.custom=true;
        slot.status=sent.status==='published'?'published':sent.status==='failed'?'error':'publishing';slot.error=sent.error;delete slot.retryAfter;
        await writeSlot(slot);
      },
    });
    const persist = async () => { article.updatedAt = new Date().toISOString(); article.revision++; await writeArticles(articles); };
    if (action === "approve") {
      if (article.commit || article.status === "deploying") throw new Error("The article has already been submitted for publication.");
      await validateAgainstRepo(article);
      article.approvedHash = publicationHash(article); article.status = "approved"; delete article.error;
      await persist();
    } else if (action === "publish") {
      if (article.status === "published") return article;
      assertPublishable(article);
      if(databaseConfigured()&&!article.commit){
        const result=await reviewArticleUnlocked(id);
        if(!result.review.output?.ready)throw new Error('Editorial review found unresolved issues. Open the review report and revise the draft.');
        article=result.article;
        if(!mediaId(article.coverImage))throw new Error('Generate the article photo before publishing.');
        article.approvedHash=publicationHash(article);
        articles=await readArticles();articles=articles.map(a=>a.id===id?article!:a);
      }
      article.status = "deploying"; delete article.error; await persist();
      try {
        article.commit = await commitArticle(article);
        await persist(); // Record the commit before pushing, so retries never need a second commit.
        await pushArticle();
        article.pushedAt ||= new Date().toISOString(); await persist();
      } catch (error) {
        article.status = "failed"; article.error = (error as Error).message; await persist();
      }
    } else if (action === "verify") {
      if (article.status === "published") return article;
      try {
        const result = await verifyPublication(article);
        article.error = result.message;
        if (result.verified) {
          article.status = "published"; article.deployId = result.deployId;
          article.verifiedAt = new Date().toISOString(); delete article.error;
        } else if (article.pushedAt && Date.now() - Date.parse(article.pushedAt) > 15 * 60 * 1000) {
          article.status = "failed";
          article.error = `${result.message} More than 15 minutes have passed. Check the Netlify logs and verify again.`;
        }
      } catch (error) { article.error = `Could not verify the website: ${(error as Error).message}`; }
      await persist();
    } else { throw new Error("Unknown action."); }
    return article;

}
