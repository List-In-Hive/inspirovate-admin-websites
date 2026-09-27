import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("saving an edit revokes approval; stale edits and concurrent writes are rejected", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inspirovate-state-"));
  process.env.ADMIN_DATA_DIR = dir;
  const { saveArticle, actOnArticle } = await import("../lib/service");
  const { withLock, readArticles } = await import("../lib/store");
  try {
    const input = { title: "Test", slug: "draft-for-store-test", description: "Description", publishedAt: "2026-01-01T00:00:00Z", coverImage: "/images/hero.webp", coverAlt: "Flowers", body: "Draft content" };
    const saved = await saveArticle(input);
    const approved = await actOnArticle(saved.id, "approve", saved.revision);
    assert.equal(approved.status, "approved");
    await assert.rejects(() => saveArticle({ ...saved, body: "Stale" }, saved.id), /another window/);
    const edited = await saveArticle({ ...approved, body: "Edited" }, saved.id);
    assert.equal(edited.status, "draft"); assert.equal(edited.approvedHash, undefined);
    await assert.rejects(() => actOnArticle(edited.id, "publish", edited.revision), /Approve/);
    await withLock(async () => { await assert.rejects(() => withLock(async () => {}), /Another operation/); });
    assert.equal((await readArticles()).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
