import path from "node:path";
export const site = {
  id: "flowers", name: "Petal & Stem", url: "https://flowerslih.netlify.app",
  repository: "git@github.com:List-In-Hive/flowers_test.git", branch: "main",
  repoPath: path.resolve(process.env.FLOWERS_REPO || path.join(process.cwd(), "../flowers")),
};
export const dataDir = path.resolve(process.env.ADMIN_DATA_DIR || path.join(process.cwd(), ".data"));
export const publicSite = { id: site.id, name: site.name, url: site.url, repository: "List-In-Hive/flowers_test", branch: site.branch };
