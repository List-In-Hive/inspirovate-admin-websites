import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { dataDir, site } from "./config";
import { Article, assertPublishable, inputSchema, publicationHash, serialize } from "./article";

const exec = promisify(execFile);
const checkout = path.join(dataDir, "publisher");
export type GitTarget = { checkout: string; repository: string; branch: string };
const defaultTarget: GitTarget = { checkout, repository: site.repository, branch: site.branch };
async function git(args: string[], cwd = checkout) {
  try {
    const { stdout } = await exec("git", args, { cwd, timeout: 45000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=15" } });
    return stdout.trimEnd();
  } catch (error) {
    const e = error as Error & { stderr?: string };
    throw new Error(`Git: ${e.stderr?.trim().slice(0, 1200) || e.message}`);
  }
}
export async function ensureCheckout(target = defaultTarget) {
  const { checkout: repo, repository, branch } = target;
  await mkdir(path.dirname(repo), { recursive: true });
  try { await access(path.join(repo, ".git")); }
  catch { await git(["clone", "--single-branch", "--branch", branch, repository, repo], path.dirname(repo)); }
  if (await git(["remote", "get-url", "origin"], repo) !== repository) throw new Error("Неожиданный адрес репозитория публикации.");
  if (await git(["branch", "--show-current"], repo) !== branch) throw new Error("Неожиданная ветка публикации.");
  await git(["fetch", "origin", branch], repo);
  await git(["merge", "--ff-only", `origin/${branch}`], repo);
  return repo;
}
export async function validateAgainstRepo(article: Article, repo = site.repoPath) {
  inputSchema.parse(article);
  await access(path.join(repo, "public", article.coverImage));
  const directory = path.join(repo, "content/blog");
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".md")) continue;
    const { data } = matter(await readFile(path.join(directory, name), "utf8"));
    if (data.slug === article.slug && (data.publicationId !== article.id || name !== `${article.slug}.md`)) {
      throw new Error("Этот адрес статьи уже занят в блоге. Выберите другой slug.");
    }
  }
}
export async function commitArticle(article: Article, target = defaultTarget): Promise<string> {
  assertPublishable(article);
  const repo = await ensureCheckout(target);
  const runGit = (args: string[]) => git(args, repo);
  await validateAgainstRepo(article, repo);
  const filename = `content/blog/${article.slug}.md`;
  const source = serialize(article, article.id);
  const file = path.join(repo, filename);
  let exists = false;
  try {
    const saved = await readFile(file, "utf8"); exists = true;
    if (saved !== source) throw new Error("Файл статьи уже существует с другим содержимым. Автоматическая перезапись запрещена.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  // Only this publication's file may be pending; recover a crash after writing it.
  const pending = await runGit(["status", "--porcelain", "--untracked-files=all"]);
  if (pending.split("\n").filter(Boolean).some(line => line.slice(3) !== filename)) throw new Error("В рабочей копии публикации есть посторонние изменения.");
  if (!exists) await writeFile(file, source, { flag: "wx" });
  await runGit(["add", "--", filename]);
  if (await runGit(["diff", "--cached", "--name-only"])) {
    await runGit(["commit", "-m", `Publish article: ${article.slug}`, "-m", `Publication-ID: ${article.id}`]);
  }
  const commit = await runGit(["log", "-1", "--format=%H", "--", filename]);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Не удалось определить коммит статьи.");
  if (article.commit && article.commit !== commit) throw new Error("Коммит статьи изменился. Требуется ручная проверка.");
  return commit;
}
export async function pushArticle(target = defaultTarget) { await git(["push", "origin", `HEAD:${target.branch}`], target.checkout); }

type Manifest = { version: number; commit: string; deployId: string; context: string; articles: { slug: string; hash: string }[] };
export function matchesManifest(manifest: Manifest, article: Article) {
  return manifest.version === 1 && manifest.context === "production" &&
    manifest.commit === article.commit && Boolean(manifest.deployId) &&
    manifest.articles?.some(entry => entry.slug === article.slug && entry.hash === publicationHash(article));
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]!); }
export async function verifyPublication(article: Article): Promise<{ verified: boolean; deployId?: string; message: string }> {
  if (!article.commit) throw new Error("Сначала отправьте одобренную статью в GitHub.");
  const options: RequestInit = { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) };
  const manifestResponse = await fetch(`${site.url}/publication-manifest.json?check=${Date.now()}`, options);
  if (!manifestResponse.ok) return { verified: false, message: "Ожидаем сборку с поддержкой проверки публикаций." };
  const manifest = await manifestResponse.json() as Manifest;
  if (!matchesManifest(manifest, article)) return { verified: false, message: "На сайте пока другая версия. Ожидаем деплой нужного коммита." };
  const response = await fetch(`${site.url}/blog/${article.slug}?check=${Date.now()}`, { ...options, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  const image = await fetch(`${site.url}${article.coverImage}`, { ...options, method: "HEAD", signal: AbortSignal.timeout(15000) });
  const verified = response.ok && html.includes(`data-publication-hash="${publicationHash(article)}"`) &&
    html.includes(`<h1>${escapeHtml(article.title)}</h1>`) &&
    html.includes(`name="description" content="${escapeHtml(article.description)}"`) &&
    html.includes(`rel="canonical" href="${site.url}/blog/${article.slug}"`) &&
    image.ok && Boolean(image.headers.get("content-type")?.startsWith("image/"));
  return { verified, deployId: manifest.deployId, message: verified ? "Статья, обложка и metadata проверены на сайте." : "Деплой найден, но страница, обложка или metadata пока не прошли проверку." };
}
