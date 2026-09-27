import { createHash } from "node:crypto";
import { z } from "zod";

export const inputSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(180),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase English letters, numbers and hyphens").max(100),
  description: z.string().trim().min(1, "Enter a description").max(400),
  publishedAt: z.iso.datetime({ offset: true }),
  coverImage: z.string().regex(/^\/images\/[a-zA-Z0-9_-]+\.webp$/, "Select a local WebP cover"),
  coverAlt: z.string().trim().min(1, "Describe the cover image").max(300),
  body: z.string().trim().min(1, "Enter the article body").max(100000),
});
export type ArticleInput = z.infer<typeof inputSchema>;
export type Article = ArticleInput & {
  schedule?: { publishAt: string; enabled: boolean };
  id: string; siteId: string; revision: number;
  status: "draft" | "approved" | "deploying" | "published" | "failed";
  approvedHash?: string; commit?: string; deployId?: string; error?: string;
  lastAIRequest?: string; pushedAt?: string; verifiedAt?: string; updatedAt: string;
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
  if (!a.approvedHash || a.approvedHash !== publicationHash(a)) throw new Error("Approve the current article version first.");
  if (Date.parse(a.publishedAt) > now) throw new Error("The publication date is in the future. Use the Calendar to schedule publication.");
}
