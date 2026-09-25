import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Article, inputSchema, publicationHash, assertPublishable } from "./article";
import { readArticles, writeArticles, withLock } from "./store";
import { commitArticle, pushArticle, validateAgainstRepo, verifyPublication } from "./publisher";

export async function saveArticle(input: unknown, id?: string) {
  return withLock(async () => {
    const parsed = inputSchema.parse(input);
    const articles = await readArticles();
    const current = id ? articles.find(a => a.id === id) : undefined;
    if (id && !current) throw new Error("Статья не найдена.");
    if (current) {
      const { revision } = z.object({ revision: z.number().int() }).parse(input);
      if (current.revision !== revision) throw new Error("Статья изменилась в другом окне. Обновите страницу.");
      if (current.commit || current.status === "deploying") throw new Error("Отправленная статья зафиксирована. Для правок опубликованных материалов пока используйте Git.");
    }
    if (articles.some(a => a.slug === parsed.slug && a.id !== id)) throw new Error("Такой адрес уже используется другим черновиком.");
    const article: Article = { ...parsed, id: id || randomUUID(), siteId: "flowers", status: "draft", revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString() };
    await validateAgainstRepo(article);
    await writeArticles([...articles.filter(a => a.id !== id), article]);
    return article;
  });
}
export async function actOnArticle(id: string, action: string, revision: number) {
  return withLock(async () => {
    const articles = await readArticles();
    const article = articles.find(a => a.id === id);
    if (!article) throw new Error("Статья не найдена.");
    if (revision !== article.revision) throw new Error("Версия статьи изменилась. Обновите страницу.");
    const persist = async () => { article.updatedAt = new Date().toISOString(); article.revision++; await writeArticles(articles); };
    if (action === "approve") {
      if (article.commit || article.status === "deploying") throw new Error("Статья уже отправлена на публикацию.");
      await validateAgainstRepo(article);
      article.approvedHash = publicationHash(article); article.status = "approved"; delete article.error;
      await persist();
    } else if (action === "publish") {
      if (article.status === "published") return article;
      assertPublishable(article);
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
          article.error = `${result.message} Прошло больше 15 минут: проверьте журнал Netlify и повторите проверку.`;
        }
      } catch (error) { article.error = `Не удалось проверить сайт: ${(error as Error).message}`; }
      await persist();
    } else { throw new Error("Неизвестное действие."); }
    return article;
  });
}
