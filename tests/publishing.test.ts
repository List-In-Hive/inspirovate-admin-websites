import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import matter from "gray-matter";
import { Article, assertPublishable, inputSchema, publicationHash, serialize } from "../lib/article";
import { assertLocal } from "../lib/http";
import { commitArticle, pushArticle, matchesManifest } from "../lib/publisher";

const exec = promisify(execFile);
const article: Article = { id: "test-publication", siteId: "flowers", revision: 1, status: "draft", title: 'A title: "flowers"', slug: "dinner-flowers", description: "A simple description", publishedAt: "2026-01-01T00:00:00Z", coverImage: "/images/hero.webp", coverAlt: "Flowers", body: "## A small gathering\n\nChoose flowers for your table.", updatedAt: new Date().toISOString() };
test("approval is tied to exact content and future dates are blocked", () => {
  assert.throws(() => assertPublishable(article), /Approve/);
  const approved = { ...article, approvedHash: publicationHash(article) };
  assert.doesNotThrow(() => assertPublishable(approved));
  assert.throws(() => assertPublishable({ ...approved, body: "changed" }), /Approve/);
  const future = { ...article, publishedAt: "2999-01-01T00:00:00Z" };
  assert.throws(() => assertPublishable({ ...future, approvedHash: publicationHash(future) }), /in the future/);
});
test("frontmatter safely roundtrips special characters and rejects unsafe paths", () => {
  const parsed = matter(serialize(article, article.id));
  assert.equal(parsed.data.title, article.title);
  assert.equal(publicationHash(inputSchema.parse({ ...parsed.data, body: parsed.content })), publicationHash(article));
  assert.throws(() => inputSchema.parse({ ...article, slug: "../escape" }));
  assert.throws(() => inputSchema.parse({ ...article, coverImage: "/images/../secret.webp" }));
});
test("verification requires the production deployment of the exact commit and article", () => {
  const committed = { ...article, commit: "a".repeat(40) };
  const manifest = { version: 1, commit: committed.commit, deployId: "netlify-id", context: "production", articles: [{ slug: article.slug, hash: publicationHash(article) }] };
  assert.equal(matchesManifest(manifest, committed), true);
  assert.equal(matchesManifest({ ...manifest, commit: "b".repeat(40) }, committed), false);
  assert.equal(matchesManifest({ ...manifest, context: "deploy-preview" }, committed), false);
  assert.equal(matchesManifest({ ...manifest, articles: [] }, committed), false);
});
test("local API rejects foreign hosts, origins, and cross-site requests", () => {
  const request = (host: string, origin: string) => new Request("http://127.0.0.1:3100/api/articles", { method: "POST", headers: { host, origin, "content-type": "application/json" } });
  assert.doesNotThrow(() => assertLocal(request("127.0.0.1:3100", "http://127.0.0.1:3100")));
  assert.throws(() => assertLocal(request("evil.example:3100", "http://evil.example:3100")));
  assert.throws(() => assertLocal(request("127.0.0.1:3100", "https://evil.example")));
});
test("real Git retry after commit and push creates exactly one article commit", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inspirovate-git-"));
  const run = async (cwd: string, ...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  try {
    const seed = path.join(dir, "seed"); const remote = path.join(dir, "remote.git");
    await mkdir(path.join(seed, "public/images"), { recursive: true });
    await mkdir(path.join(seed, "content/blog"), { recursive: true });
    await writeFile(path.join(seed, "public/images/hero.webp"), "test image");
    await writeFile(path.join(seed, "content/blog/.keep"), "");
    await run(seed, "init", "-b", "main");
    await run(seed, "config", "user.name", "Publisher test"); await run(seed, "config", "user.email", "test@example.com");
    await run(seed, "add", "."); await run(seed, "commit", "-m", "Seed");
    await run(dir, "clone", "--bare", seed, remote);
    const target = { checkout: path.join(dir, "publisher"), repository: remote, branch: "main" };
    const approved = { ...article, approvedHash: publicationHash(article) };
    const first = await commitArticle(approved, target);
    const retryBeforePush = await commitArticle(approved, target);
    assert.equal(first, retryBeforePush);
    // Hosted runners are ephemeral: recover a recorded commit lost before push.
    await rm(target.checkout, { recursive: true, force: true });
    const originalDate = process.env.GIT_COMMITTER_DATE;
    process.env.GIT_COMMITTER_DATE = '2030-01-01T00:00:00Z';
    let recovered: string;
    try { recovered = await commitArticle({ ...approved, commit: first }, target); }
    finally { if (originalDate === undefined) delete process.env.GIT_COMMITTER_DATE; else process.env.GIT_COMMITTER_DATE = originalDate; }
    assert.notEqual(recovered, first);
    await pushArticle(target);
    const retryAfterPush = await commitArticle({ ...approved, commit: recovered }, target);
    assert.equal(recovered, retryAfterPush);
    await pushArticle(target);
    assert.equal(await run(target.checkout, "rev-list", "--count", "HEAD"), "2");
    assert.equal(await run(remote, "rev-parse", "main"), recovered);
    assert.equal(await readFile(path.join(target.checkout, `content/blog/${article.slug}.md`), "utf8"), serialize(article, article.id));
    await assert.rejects(() => commitArticle({ ...approved, id: "another-publication" }, target), /already in use/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
