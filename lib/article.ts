import { createHash } from "node:crypto";
import { z } from "zod";

export const inputSchema = z.object({
  title: z.string().trim().min(1, "Укажите заголовок").max(180),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Адрес: латинские буквы, цифры и дефисы").max(100),
  description: z.string().trim().min(1, "Укажите описание").max(400),
  publishedAt: z.iso.datetime({ offset: true }),
  coverImage: z.string().regex(/^\/images\/[a-zA-Z0-9_-]+\.webp$/, "Выберите локальную WebP-обложку"),
  coverAlt: z.string().trim().min(1, "Опишите обложку").max(300),
  body: z.string().trim().min(1, "Добавьте текст статьи").max(100000),
});
export type ArticleInput = z.infer<typeof inputSchema>;
export type Article = ArticleInput & {
  id: string; siteId: "flowers"; revision: number;
  status: "draft" | "approved" | "deploying" | "published" | "failed";
  approvedHash?: string; commit?: string; deployId?: string; error?: string;
  pushedAt?: string; verifiedAt?: string; updatedAt: string;
};
export function publicationHash(a: ArticleInput) {
  return createHash("sha256").update(JSON.stringify([
    a.title.trim(), a.slug, a.description.trim(), a.publishedAt,
    a.coverImage, a.coverAlt.trim(), a.body.trim(),
  ])).digest("hex");
}
export function serialize(a: ArticleInput, id: string) {
  const fields = { title: a.title, slug: a.slug, description: a.description, publishedAt: a.publishedAt,
    status: "published", coverImage: a.coverImage, coverAlt: a.coverAlt, publicationId: id };
  return `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${a.body.trim()}\n`;
}
export function assertPublishable(a: Article, now = Date.now()) {
  inputSchema.parse(a);
  if (!a.approvedHash || a.approvedHash !== publicationHash(a)) throw new Error("Сначала одобрите текущую версию статьи.");
  if (Date.parse(a.publishedAt) > now) throw new Error("Дата публикации ещё не наступила. Планировщик появится на следующем этапе.");
}
