# Website publishing contract

This describes the current Inspirovate publisher, not every possible Next.js website. Implement the contract before importing a new repository. The website must keep working independently of the admin.

## Required files

```text
app/                           # src/app is also supported
  page.tsx
  about/page.tsx
  services/page.tsx             # or a real product/category page
  contact/page.tsx
  blog/page.tsx
  blog/[slug]/page.tsx
  sitemap.ts
  robots.ts
content/blog/example-article.md
public/images/hero.webp
public/__forms.html             # when using Netlify Forms
scripts/publication-manifest.ts
lib/blog.ts
lib/publication.ts
lib/seo.ts
package.json
package-lock.json
.nvmrc
```

The blog route, Markdown folder, initial WebP and manifest build hook are compatibility requirements. Other business-page names can vary. The importer scans ordinary App Router paths; route groups and dynamic service routes may require extra onboarding support. The current importer is not a general CMS adapter or monorepo detector.

## Markdown schema

```markdown
---
title: "A useful guide for your customers"
slug: "a-useful-guide-for-your-customers"
description: "A factual summary of this article."
publishedAt: "2026-01-15T16:00:00Z"
status: "published"
coverImage: "/images/hero.webp"
coverAlt: "Describe what the image shows"
---

Opening paragraph.

## A helpful section

Read about [our services](/services).

![A second view](/images/second-photo.webp)
```

All seven frontmatter fields are required. The publisher may add `publicationId`; tolerate it without including it in the hash. Use lowercase English words, numbers and single hyphens for the slug (maximum 100 characters). Keep `publishedAt` as the original quoted ISO string with an offset; converting it to another equivalent date string changes the hash.

Validate duplicate slugs, dates, empty bodies and missing local images. Serve only `status: published` articles whose date is not in the future. Exclude drafts and future articles from routes, lists and sitemap. A future date alone does not rebuild the website; the external worker pushes content when due.

Render one plain-text H1, the description and a cover once. Render the body as Markdown with raw HTML disabled. Supporting images in the body must display responsively. The cover is already on the page; do not repeat it as a second body image. Use real local `/images/NAME.webp` files; the publisher writes generated `blog-HASH.webp` assets there.

## Exact hash algorithm

Use this server-side helper in both the route and manifest script. Do not include status, publicationId, reading time or date formatting. Do not normalize the Markdown beyond the trim shown here.

```ts
import { createHash } from "node:crypto";

export function publicationHash(article: {
  title: string; slug: string; description: string; publishedAt: string;
  coverImage: string; coverAlt: string; body: string;
}) {
  return createHash("sha256").update(JSON.stringify([
    article.title.trim(), article.slug, article.description.trim(),
    article.publishedAt, article.coverImage, article.coverAlt.trim(),
    article.body.trim(),
  ])).digest("hex");
}
```

The initial HTML from `/blog/[slug]` must include:

```tsx
<article data-publication-hash={publicationHash(article)}>
  <h1>{article.title}</h1>
  {/* cover and Markdown body */}
</article>
```

The current verifier checks literal HTML, so keep the H1 plain, without nested spans or extra attributes. Generate a matching description meta tag and a canonical link to the configured production origin plus `/blog/SLUG`, with no trailing slash. Verify these in the server response, not just after client JavaScript runs.

## Build manifest

Add `tsx` as a dependency available during builds and this script hook to `package.json`:

```json
{
  "scripts": {
    "prebuild": "node --import tsx scripts/publication-manifest.ts",
    "build": "next build"
  }
}
```

`scripts/publication-manifest.ts` should read the same validated, public article collection as the blog routes and write `public/publication-manifest.json`:

```ts
import { writeFileSync } from "node:fs";
import { getArticles } from "../lib/blog";
import { publicationHash } from "../lib/publication";

writeFileSync("public/publication-manifest.json", JSON.stringify({
  version: 1,
  commit: process.env.COMMIT_REF || null,
  deployId: process.env.DEPLOY_ID || null,
  context: process.env.CONTEXT || "local",
  builtAt: new Date().toISOString(),
  articles: getArticles().map(article => ({
    slug: article.slug,
    hash: publicationHash(article),
  })),
}, null, 2) + "\n");
```

Ignore the generated manifest in Git. Netlify supplies the deployment identifiers. Never fabricate `production`, a commit or a deploy ID for local verification. The verifier requires version 1, production context, a nonempty deploy ID and the exact article commit. A newer deployment can fail this exact-commit check even if the page content is unchanged; this is a current verifier limitation.

## Website origin and metadata

On Netlify use its built-in `URL`, the primary site address. Outside Netlify, an optional `SITE_URL` may supply the origin. Validate that it is an HTTP(S) origin without credentials, path, query or fragment. Use relative paths for navigation and images, absolute production URLs for canonicals, sitemap and social metadata. Do not use `DEPLOY_URL` or `DEPLOY_PRIME_URL` as the canonical origin. Rebuild after a primary-domain change. See [Netlify's environment-variable reference](https://docs.netlify.com/build/configure-builds/environment-variables/).

Keep previews and demonstration sites excluded from indexing. Use accurate Article JSON-LD without invented author qualifications, ratings or reviews. The client site does not require the admin database or an OpenAI key.

## Netlify form contract

For an enquiry form, use a static definition in `public/__forms.html`:

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Form definition</title></head>
<body>
  <form name="website-enquiry" method="POST" data-netlify="true" netlify-honeypot="bot-field" hidden>
    <input type="hidden" name="form-name" value="website-enquiry">
    <input name="name" type="text">
    <input name="email" type="email">
    <input name="phone" type="text">
    <textarea name="message"></textarea>
    <input name="bot-field" type="text">
  </form>
</body>
</html>
```

The visible React form must use these exact names, include `form-name=website-enquiry` and the hidden honeypot, and POST URL-encoded data with `fetch` to `/__forms.html`. Check `response.ok`. Show a pending state, prevent duplicate submissions and preserve values on error. Do not show a fake successful submission locally. Any additional field must exist in both forms. No file upload is required by this template.

Enable form detection and redeploy; configure notifications and verify a real deployed test submission. See [Next.js form troubleshooting](https://docs.netlify.com/manage/forms/troubleshooting-tips/). Form setup is independent of blog compatibility: the admin scanner does not test email delivery.

## Acceptance checks

1. A fresh checkout installs and builds without admin credentials.
2. A valid published Markdown article appears on `/blog` and its route; draft and future fixtures remain hidden.
3. Invalid metadata, duplicate slugs and missing images fail validation clearly.
4. Cover and supporting WebP images load; internal and external links reach the intended pages.
5. The manifest hash matches the HTML marker for exactly the same source content.
6. A production deploy exposes the expected manifest, plain H1, description and canonical without redirecting the verification URLs.
7. Form field names match, errors preserve input, and the deployed enquiry appears in Netlify and reaches the configured recipient.
8. The admin import passes compatibility; a real publication reaches Published after the matching Netlify deploy.
