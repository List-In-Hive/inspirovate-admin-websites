import { repositoryPath,repositoryText } from "./repository-files";
import { hostedRuntime } from './runtime';
import { assertPublicWebsiteNetwork } from "./public-network";
import { mediaId } from "./media-path";
import { readMedia } from "./content-store";
import { databaseConfigured } from "./database";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { dataDir, getSite } from "./config";
import { Article, assertPublishable, inputSchema, publicationHash, serialize } from "./article";

const exec = promisify(execFile);
const checkout = () => path.join(dataDir, getSite().id === "flowers" ? "publisher" : `publisher-${getSite().id}`);
export type GitTarget = { checkout: string; repository: string; branch: string };
const defaultTarget = (): GitTarget => ({ checkout: checkout(), repository: getSite().repository, branch: getSite().branch });
async function git(args: string[], cwd = checkout()) {
  const auth = getSite().gitToken ? {
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${getSite().gitToken}`).toString('base64')}`,
  } : {};
  const identity = hostedRuntime() ? { GIT_AUTHOR_NAME: 'Inspirovate Publisher', GIT_AUTHOR_EMAIL: 'publisher@users.noreply.github.com', GIT_COMMITTER_NAME: 'Inspirovate Publisher', GIT_COMMITTER_EMAIL: 'publisher@users.noreply.github.com' } : {};
  try {
    const { stdout } = await exec("git", ["-c","core.hooksPath=/dev/null",...args], { cwd, timeout: 45000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, ...auth, ...identity, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=15" } });
    return stdout.trimEnd();
  } catch (error) {
    const e = error as Error & { stderr?: string };
    throw new Error(`Git: ${e.stderr?.trim().slice(0, 1200) || e.message}`);
  }
}
export async function ensureCheckout(target = defaultTarget()) {
  const { checkout: repo, repository, branch } = target;
  await mkdir(path.dirname(repo), { recursive: true });
  try { await access(path.join(repo, ".git")); }
  catch { await git(["clone", "--single-branch", "--branch", branch, repository, repo], path.dirname(repo)); }
  if (await git(["remote", "get-url", "origin"], repo) !== repository) throw new Error("Unexpected publishing repository URL.");
  if (await git(["branch", "--show-current"], repo) !== branch) throw new Error("Unexpected publishing branch.");
  await git(["fetch", "origin", branch], repo);
  await git(["merge", "--ff-only", `origin/${branch}`], repo);
  return repo;
}
export async function ensureProjectSource() {
  const site=getSite();if(!site.managed&&!hostedRuntime())return site.repoPath;
  return ensureCheckout({checkout:site.repoPath,repository:site.repository,branch:site.branch});
}
export async function validateAgainstRepo(article: Article, repo = getSite().repoPath) {
  if((getSite().managed||hostedRuntime())&&repo===getSite().repoPath)await ensureProjectSource();
  inputSchema.parse(article);
  const imageId=mediaId(article.coverImage);
  if(imageId && databaseConfigured()) { if(!await readMedia(imageId)) throw new Error("Photo not found in this project."); }
  else await access(await repositoryPath(repo, `public${article.coverImage}`));
  const directory = await repositoryPath(repo, "content/blog");
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".md")) continue;
    const { data } = matter(await repositoryText(repo, `content/blog/${name}`));
    if (data.slug === article.slug && (data.publicationId !== article.id || name !== `${article.slug}.md`)) {
      throw new Error("This article URL is already in use. Choose a different slug.");
    }
  }
}
export async function commitArticle(article: Article, target = defaultTarget()): Promise<string> {
  assertPublishable(article);
  const repo = await ensureCheckout(target);
  const runGit = (args: string[]) => git(args, repo);
  await validateAgainstRepo(article, repo);
  const filename = `content/blog/${article.slug}.md`;
  const source = serialize(article, article.id);
  const file = await repositoryPath(repo, filename);
  let exists = false;
  try {
    const saved = await readFile(file, "utf8"); exists = true;
    if (saved !== source) throw new Error("The article file already exists with different content. Automatic overwriting is not allowed.");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const imageId=mediaId(article.coverImage);
  const photo=imageId ? await readMedia(imageId) : undefined;
  const photoFilename=photo ? `public${article.coverImage}` : undefined;
  if(imageId&&!photo)throw new Error('The article photo is missing.');
  if(photo&&photoFilename){
    const photoPath=await repositoryPath(repo,photoFilename);await mkdir(path.dirname(photoPath),{recursive:true});
    try { const saved=await readFile(photoPath);if(!saved.equals(photo.bytes))throw new Error('The existing photo differs from the saved version.'); }
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(photoPath,photo.bytes,{flag:'wx'});}
  }
  // Only this publication's file may be pending; recover a crash after writing it.
  const pending = await runGit(["status", "--porcelain", "--untracked-files=all"]);
  if (pending.split("\n").filter(Boolean).some(line => line.slice(3) !== filename && line.slice(3) !== photoFilename)) throw new Error("The publishing checkout contains unrelated changes.");
  if (!exists) await writeFile(file, source, { flag: "wx" });
  await runGit(["add", "--", filename, ...(photoFilename?[photoFilename]:[])]);
  if (await runGit(["diff", "--cached", "--name-only"])) {
    await runGit(["commit", "-m", `Publish article: ${article.slug}`, "-m", `Publication-ID: ${article.id}`]);
  }
  const commit = await runGit(["log", "-1", "--format=%H", "--", filename]);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Could not determine the article commit.");
  if (exists && article.commit && article.commit !== commit) throw new Error("The article commit has changed. Manual review is required.");
  return commit;
}
export async function pushArticle(target = defaultTarget()) { await git(["push", "origin", `HEAD:${target.branch}`], target.checkout); }

type Manifest = { version: number; commit: string; deployId: string; context: string; articles: { slug: string; hash: string }[] };
export function matchesManifest(manifest: Manifest, article: Article) {
  return manifest.version === 1 && manifest.context === "production" &&
    manifest.commit === article.commit && Boolean(manifest.deployId) &&
    manifest.articles?.some(entry => entry.slug === article.slug && entry.hash === publicationHash(article));
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]!); }
export async function verifyPublication(article: Article): Promise<{ verified: boolean; deployId?: string; message: string }> {
  if (!article.commit) throw new Error("Send the approved article to GitHub first.");
  await assertPublicWebsiteNetwork(getSite().url);
  const options: RequestInit = { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) };
  const manifestResponse = await fetch(`${getSite().url}/publication-manifest.json?check=${Date.now()}`, options);
  if (!manifestResponse.ok) return { verified: false, message: "Waiting for a build that supports publication verification." };
  const manifest = await manifestResponse.json() as Manifest;
  if (!matchesManifest(manifest, article)) return { verified: false, message: "The website is running a different version. Waiting for the expected commit to deploy." };
  const response = await fetch(`${getSite().url}/blog/${article.slug}?check=${Date.now()}`, { ...options, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  const image = await fetch(`${getSite().url}${article.coverImage}`, { ...options, method: "HEAD", signal: AbortSignal.timeout(15000) });
  const verified = response.ok && html.includes(`data-publication-hash="${publicationHash(article)}"`) &&
    html.includes(`<h1>${escapeHtml(article.title)}</h1>`) &&
    html.includes(`name="description" content="${escapeHtml(article.description)}"`) &&
    html.includes(`rel="canonical" href="${getSite().url}/blog/${article.slug}"`) &&
    image.ok && Boolean(image.headers.get("content-type")?.startsWith("image/"));
  return { verified, deployId: manifest.deployId, message: verified ? "The article, cover image and metadata have been verified on the website." : "The deployment was found, but the page, cover image or metadata has not passed verification yet." };
}
