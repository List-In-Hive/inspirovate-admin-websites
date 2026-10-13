# Connect a client website

Follow this guide for each new client. Each website has its own GitHub repository, Netlify project, business rules, article history and calendar. The shared admin and scheduler run on servers; your Mac does not need to stay on.

## 1. Prepare the business brief

Collect the business name, verified services or products, audience, language, visual direction, approved contact details and real service area. Record what is unknown. Do not invent prices, reviews, qualifications or guarantees.

Open **Website prompt**, copy the prompt and replace its bracketed details. Give it to the coding assistant that will build the website. The prompt includes the full publishing contract; it is a website-building brief, not the prompt used for AI articles.

## 2. Build and check the website

Use Next.js App Router and TypeScript. Start with Home, About, a service or product page, Contact, Blog and an individual blog page. Add detail pages when the business needs them. Use real content and useful internal links, not empty pages created just to reach a link count.

The admin requires Markdown articles under `content/blog`, an initial WebP image under `public/images`, a blog route with a publication hash, and a build-generated publication manifest. The **Developer requirements** tab describes the exact format. A generic React site without this integration cannot receive verified blog publications.

Run the repository's lint, type checks, relevant tests and production build. Inspect mobile layouts, navigation, article links, images, metadata and missing-page behavior. Local builds cannot prove Netlify form delivery or production publication verification.

## 3. Put the website on GitHub

Create a separate repository and push the reviewed source, lockfile, Markdown articles and WebP images. Exclude secrets, dependencies and build output. Use the repository's default branch for production.

Grant the admin's GitHub token **Contents: read and write** for this repository. This permission belongs to the server configuration, never to the public website. A private repository must also be accessible to Netlify's GitHub integration.

## 4. Deploy on Netlify

Import the GitHub repository in Netlify. For a website at the repository root, leave **Base directory** empty, use **Build command: npm run build** and **Publish directory: .next**. Keep the automatic Next.js adapter. A monorepo needs its own base-directory configuration; the current admin importer expects its blog content at the repository root.

Commit `.nvmrc` with the project's Node version so you do not need to enter `NODE_VERSION` manually. Follow the [Netlify Next.js setup guide](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

The website should use Netlify's built-in `URL` for its primary production address. Do not enter a manual `SITE_URL` on Netlify or use a preview URL as the canonical address. Outside Netlify, an optional `SITE_URL` can supply an origin. Rebuild after changing the primary domain. See [Netlify build variables](https://docs.netlify.com/build/configure-builds/environment-variables/).

Set the GitHub repository's **About → Website** to the final live URL. This helps the admin discover it. You can also enter the live URL in the admin's Project settings. The admin still needs that address to check published pages; a relative path cannot identify which website to check.

## 5. Activate and test the enquiry form

A Next.js form needs a matching static definition in `public/__forms.html`, with the same form and field names as the visible form. Submit URL-encoded data through AJAX to `/__forms.html`, including `form-name` and the honeypot field. Do not send JSON. See [Netlify Forms setup](https://docs.netlify.com/manage/forms/setup/).

1. In Netlify **Forms**, enable form detection and redeploy.
2. Confirm that the intended form appears under active forms.
3. Configure the recipient under submission notifications.
4. If using the existing Flowers template, set `NEXT_PUBLIC_FORMS_ENABLED=true` and rebuild. This template-specific switch is separate from form detection. Coffee is a test site and has no contact form.
5. Send a clearly marked test enquiry on the deployed website. Confirm both the submission in Netlify and the received email. A browser success message alone does not prove email delivery.

If the form is absent or messages do not arrive, check the static definition, matching field names, form detection, redeploy and spam submissions. Use the [form troubleshooting guide](https://docs.netlify.com/manage/forms/troubleshooting-tips/).

## 6. Import into this admin

Open **All projects → Add project**, paste `https://github.com/OWNER/REPOSITORY`, then choose **Analyze and add project**. Import reads selected files and uses a paid OpenAI request to suggest business settings. It does not modify repository code or deploy the website. Automatic blogging starts off.

In **Settings**, check the repository, branch and live website URL. **Recheck repository compatibility** repeats the source scan without generating AI content. It checks integration markers, not a running build or form submission. Fix any reported blockers, push the website changes, deploy, then recheck.

## 7. Review blog rules and source material

In **Blog rules & settings → Rules & format**, review business facts, audience, tone, goals, content areas and restrictions. Defaults for new articles are **2 photos, 3 external links and 3 internal links**. Counts need enough useful, verifiable sources and real website pages; preparation can stop if it cannot meet the rules safely.

**Save draft settings** keeps proposed changes for review. **Apply all rules** makes them active for new generation. Existing articles keep their saved format snapshot; changing settings does not retrofit older drafts or published articles.

Under **Knowledge**, review and enable approved source notes. Imported notes start disabled and are not used until enabled. Under **Blog library**, refresh the repository history so the writer can avoid repeating topics and reference existing articles. Settings, enabled knowledge and article history are used together; they are not a substitute for factual review.

Return to **Settings** and select **Confirm website setup** after reviewing the business information and live address. Use **Check connections** to verify the database and OpenAI model access without generating a blog.

## 8. Test one article, then enable the calendar

Create one draft and review its text, photos, link counts and destinations. Generation and AI editing are paid requests. **Publish now** sends the latest saved article and its photos to the client repository; Netlify then builds the website. Confirm **Published** and inspect the live page before relying on automation.

In **Calendar**, choose the monthly frequency and enable **Automatic generation and publication**. The default is four articles per month, spaced across the month at 8:00 AM Pacific Time. Dates are displayed and edited in your browser's local time zone.

The worker prepares drafts at or after the point 24 hours before publication. With the default late policy, a late draft moves publication to allow a full 24 hours for review. With the alternative policy, overdue content can publish as soon as it is ready. The latest saved version publishes when due, even without manual approval; unsaved edits are not included. Turn automation off to pause scheduled creation and publication.

The configured worker checks hourly. Queues, AI preparation and the website build add delay. A green automatic heartbeat shows a recent automatic check, not a guarantee that each article succeeded. Inspect the article card and Actions run. A manual run does not prove that the automatic trigger works.

## Common questions

### Why does an article still say Publishing?

The admin must verify the production manifest, expected commit, content hash, heading, description, canonical address and all article images. Check Netlify's build log and the live URLs, then use **Verify publication**. The current verifier requires the exact publication commit: a newer unrelated deployment can also prevent verification. Do not generate or publish a duplicate to clear this status.

### Can two projects generate at the same time?

Yes, with the updated admin and worker deployed together. Operations within the same project are serialized to protect article history and publication. Older deployed workers can still hold the earlier global lock.

### What does Remove project do?

It archives the project in the admin and pauses automation. It preserves articles and settings and does not delete the GitHub repository or Netlify website. A publication already sent to GitHub may still finish. Restoring keeps automation off until you enable it.

### Where are forms, drafts and published articles stored?

Enquiries live in Netlify Forms. Business rules, drafts, revisions, AI request records, calendar slots and draft image bytes live in Supabase. Published Markdown and WebP images live in each website's GitHub repository. No OpenAI or database key belongs in the client website.
