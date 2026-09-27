# Inspirovate Admin

Cloud migration is in progress. See [DEPLOYMENT.md](DEPLOYMENT.md) for the password-protected server runtime and remaining activation steps. Hosted access is blocked until credentials are configured. The scheduled GitHub job stays disabled until `BLOG_SCHEDULER_ENABLED=true` is set in repository Actions variables; manual dispatch still runs real work.

An English-language content admin built with Next.js and React-admin for the Petal & Stem website. This repository contains the admin interface, its API, database access and publishing scheduler in separate files. The public Flowers website remains in its own repository and runs independently.

## Local development and testing

Use Node.js 24 (or 22.14+), Git and a sibling checkout of `List-In-Hive/flowers_test`. Local publishing uses your existing Git SSH access and configured commit identity.

```bash
nvm use
npm ci
cp .env.example .env.local
# Fill in the connection settings without committing them.
npm run dev
```

Open http://127.0.0.1:3100. For a local production build, run `npm run build`, then `npm start`. Stop the previous server before starting another instance on the same port.

The local interface has no login, as requested for the pilot. It binds to `127.0.0.1`, and API routes validate Host, Origin and request format. Hosted mode requires password authentication; use the documented server entry point for hosting.

The Next.js server provides both the interface and API during local testing. No scheduler needs to run on the Mac. Production scheduling is a separate server process; its workflow is prepared but must be configured and deployed before it can run.

## Connections

Set these server-only variables in `.env.local`:

- `DATABASE_URL`: Supabase → Connect → Session pooler, port 5432. Replace the password placeholder and URL-encode any special characters in the password.
- `OPENAI_API_KEY`: your OpenAI API key.
- `OPENAI_MODEL`: optional; defaults to `gpt-5.6-terra`.
- `FLOWERS_REPO`: optional path to the client website checkout; defaults to `../flowers`.

Restart the admin after changing environment variables. Open **Project → Settings** and select **Check connections**. The key check verifies access to the configured model without generating content.

Supabase connections verify both the TLS certificate and hostname. The official public Supabase CA is bundled in `certs/` and used only for Supabase database hosts. Transaction pooling on port 6543 is not supported because publishing uses session advisory locks.

Credentials, `.data`, dependency directories and build output are excluded from Git. The browser never receives database credentials or the OpenAI key.

## Database and migration

The first database connection creates the private `inspirovate` schema and imports `.data/articles.json`, preserving IDs, revisions, approvals and Git/Netlify metadata. The original file remains in place, and `.data/articles.before-supabase.json` is saved before import. Importing again does not overwrite existing database records.

Run `npm run db:migrate` to perform the migration explicitly. Connect from the local admin first so existing articles are imported before starting the cloud scheduler. A cloud run without the local file does not mark the Mac import as complete.

Before DATABASE_URL is configured, manual article editing uses the existing local JSON store. Once DATABASE_URL is configured, a connection error does not silently switch storage back to local files. AI and calendar features require Supabase.

Tables use row-level security, with no public policies or schema grants. The backend connects using the PostgreSQL server role. Do not expose the private schema through Supabase Data API.

## Write and publish manually

1. Open **Articles → New article** and enter the title, slug, description, date with time zone, Markdown body and an initial cover path.
2. Select **Save draft**, run **Review & improve with AI**, and generate the article photo. Raw HTML is not rendered.
3. Select **Publish now** and confirm the specific article. The backend sets the publication time to now, checks the latest saved text and photo, and creates one commit containing the Markdown article and WebP photo in an isolated publishing checkout. It pushes to the Flowers `main` branch; Netlify builds through the existing Git integration. A linked calendar slot records this early publication so it is not published again later.
4. The preview checks every 20 seconds while open. **Published** requires a matching production manifest, exact commit, article content hash, page title, description, canonical URL and accessible cover image.

`npm run seed` creates one example draft only when storage is empty. It neither approves nor publishes it. **Publish now** replaces a future article date with the current time; use the Calendar to keep a future publication time.

## AI drafts and revisions

**Create with AI** runs writing (up to 5,000 output tokens), a separate editorial pass (up to 7,000), and one image generation. Text requests use Structured Outputs and `store: false`. There are no automatic retries of ambiguous paid requests. Configure the business profile in **Project → Settings** and verified sources in **Knowledge**.

Set up business facts, audience, writing style, blog goals, content areas and editorial rules once in project Settings. These settings do not expire at the end of the year. They apply to both scheduled generation and Create next article; update them when the business changes. Legacy profiles receive generic strategy defaults without overwriting their saved facts.

Generation sends the business profile and ongoing strategy, enabled knowledge entries, recent article metadata and related full texts to OpenAI. An AI revision also sends the current article and editing instructions. The history records request results and known token usage. After a timeout, the charge may be unknown: check OpenAI Usage before starting a new paid request.

Generated output is saved before the draft is created. Retrying a saved result does not generate content again. A request with an uncertain outcome requires a deliberate new request. AI revisions preserve the slug and invalidate manual approval.

Each article gets one generated OpenAI photo, optimized to WebP and reused as both cover and article image. Draft image bytes are stored in Supabase; publication adds the image to the client website repository. Articles remain editable until sent to GitHub.

## Calendar and automatic publication

Settings are stored per project. This pilot has one connected project, Flowers. The default is **4 articles per month**, adjustable from 1 to 28.

Each month is divided into N parts using day `1 + floor(index × daysInMonth / N)`, at **8:00 AM America/Los_Angeles**. For four September articles, the dates are September 1, 8, 16 and 23. Pacific daylight saving time is handled automatically. The calendar displays the current and following month and automatically extends as time advances. It needs no monthly or annual reset. At four articles per month, a full year has 48 planned articles.

- Past dates are skipped when creating a new calendar.
- Changing the monthly count recalculates future slots that have not started or been manually adjusted. Prepared articles and custom dates remain, so a transition month can differ from the new count.
- Each slot has an editable date and time. Individual topic selection is not required. Nonexistent or ambiguous times during clock changes are rejected.
- **Create now** generates a draft early and keeps the assigned publication date.
- Otherwise, the server generates content on its first check at or after the 24-hour lead time. AI chooses the next useful reader question from the saved project strategy, verified knowledge and article history. Evergreen content is the default; the date does not force a seasonal article.
- The admin can revise the draft manually or through AI before it is sent to GitHub.
- At publication time, the scheduler uses the latest saved version and records its approval automatically. **Reading the article, leaving it unreviewed or resetting manual approval does not cancel scheduled publication.** Unsaved browser edits are not published.
- By default, late generation preserves a full 24-hour review period and postpones publication. The alternative setting keeps the original date and publishes immediately when overdue.
- Errors appear in the calendar. Git retries do not force-push, overwrite another article or create duplicate published content.

## Server scheduler: independent of the Mac

The prepared `.github/workflows/scheduler.yml` workflow runs `npm run scheduler:once` every five minutes (minutes 02, 07, 12, …, 57 UTC, avoiding the top-of-hour peak) and supports **Actions → Blog scheduler → Run workflow**. Confirm automatic triggering in Actions with the `event:schedule` filter; a successful manual `workflow_dispatch` run does not verify the cron trigger. Check both the job result and the article status in the admin calendar.

The scheduler job uses the `WEBSITES` GitHub environment. Add these Actions secrets under **Settings → Environments → WEBSITES → Environment secrets** (repository secrets also work):

- `DATABASE_URL`: the same Supabase Session pooler connection.
- `OPENAI_API_KEY`: the OpenAI key.
- `PROJECTS_GITHUB_TOKEN`: a fine-grained token with Contents read/write access to the selected client website repositories. Organization approval may be required. GitHub reserves secret names starting with `GITHUB_`; the workflow maps this secret to the application's `GITHUB_PROJECTS_TOKEN` environment variable. Keep `GITHUB_PROJECTS_TOKEN` as the variable name on Render and in local settings. The legacy `FLOWERS_GITHUB_TOKEN` is still supported for Flowers only.

Set the Actions repository variable `BLOG_SCHEDULER_ENABLED` to `true` to enable scheduled processing. A manual **Run workflow** processes due articles even when this variable is absent or false.

An optional Actions variable, `OPENAI_MODEL`, selects the model. Git receives the token through environment-based configuration; it is not stored in repository URLs or Git config files. Local publishing continues to use SSH when no token is configured.

The workflow must be on the default branch, with GitHub Actions enabled and sufficient execution minutes. Five-minute checks consume Actions minutes separately from OpenAI usage. Merely having the workflow in the source code does not activate it: verify a successful Actions run and the last scheduler check shown in the Calendar.

GitHub can delay scheduled runs, and Netlify needs time to build. 8:00 AM is the target submission time, not a guarantee that the page will be live at that exact minute. For more precise execution, the same `scheduler:once` command can run from system cron on a persistent server with Node.js 24, Git, a Flowers checkout and the required environment variables.

`npm run scheduler` is a development-only local loop. It is not needed for cloud scheduling and is not started by `dev` or `start`. PostgreSQL locks serialize competing workers. The scheduler does not expose the admin interface publicly.

## Recovery and storage

- `.data/publisher` is the isolated publishing clone. Publishing does not modify the main Flowers working directory.
- `.data/articles.json` is the legacy local store. Supabase becomes the active store after configuration. Committing source code is not a backup of database content.
- Stop the local admin before copying `.data` for backup. Use your database backup process for Supabase records.
- After a local crash, `.data/operation.lock` can remain. Verify that all admin processes have stopped before removing this file. Active locks are never stolen based on a timer.
- A retry reuses the intended article content. If an ephemeral runner loses an unpushed local commit, it can recreate that commit; an existing published file with different content is rejected.
- After 15 minutes without a matching deployment, check the Netlify build logs and select **Verify publication** again. Closing the browser stops its polling but does not cancel an already submitted Netlify build.

The public website generates `/publication-manifest.json` during its build and embeds the article hash in its HTML. The manifest contains only public articles and public deployment identifiers. Exact commit matching is deliberate: if a newer deployment overtakes an article, manual verification may be needed.

## Current scope

One configured client website, project-scoped English interface, knowledge sources, a published blog library, version snapshots, AI editorial review and one generated WebP per article. Published content is locked in the admin and must currently be edited through Git. Customer accounts, enquiry synchronization and photo uploads are not included.

## Validation

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Tests cover PostgreSQL DDL through PGlite, unique slugs, TLS/session pooling, approval and revision checks, local API boundaries, paid-request deduplication, recovery after storage failures, Pacific DST, review windows and scheduled publishing of the latest saved version. Publishing tests use a real temporary Git remote. AI tests use a substitute provider and incur no API charges. Live connections and deployed scheduler runs are checked separately.

## Project workspaces

The home page is a project directory. Open **Flowers** to manage its Overview, Articles, Calendar, Create with AI and Settings. There are no global article, calendar, generation or settings pages.

Each workspace has its own URLs (`/#/projects/flowers/calendar`), resource cache, business profile, schedule, AI history, article storage and publication destination. API operations require `/api/projects/<project-id>/…`; unknown projects are rejected. Legacy global API routes are removed. Migration `002-project-isolation.sql` assigns existing records to Flowers without changing their content or publication metadata, and allows the same slug in different projects.

Projects are stored in Supabase. The bundled Flowers definition is seeded once; removing it is not undone by a restart. Use **Projects → Add project** and paste the main HTTPS GitHub repository link. The server reads selected website files without executing repository code, analyzes the supported blog structure, imports existing blog material and source notes, and asks OpenAI to suggest the business profile and ongoing content strategy. Selected source excerpts are sent to OpenAI for this paid analysis; credential files are excluded and common credential patterns are redacted. Imported knowledge notes start disabled. Review inferred facts before enabling them.

New projects start with four articles per month and automatic blogging off. Review **Settings**, supply the live HTTPS website address if the repository does not explicitly identify it, and select **Save and confirm project setup**. Unsupported repositories remain blocked from activation with a list of missing integration elements. After the website is adapted, use **Recheck repository compatibility**; this is a read-only GitHub check and does not rerun paid AI analysis. Compatibility checks inspect structure; they do not execute the client build or prove every runtime behavior. Each website must support the existing Markdown format, WebP covers and publication verification manifest.

The **Automatic blog creation and publication** switch pauses both scheduled generation and scheduled publication; manual actions remain available. **Remove project** archives the project, pauses automation, and retains its data. It never deletes the GitHub repository or live site. **Show removed projects → Restore project** restores access with automation still off. A publication already pushed to GitHub may still complete. Archived projects are excluded from server scheduling and project APIs; mutations recheck archive status under the scheduler lock.

A repeated repository link returns the existing project, including removed projects, without another paid setup request. An interrupted AI analysis is not retried automatically; its basic project profile remains available for manual completion. No account authorization is implemented in this local pilot. Private repository analysis requires `GITHUB_PROJECTS_TOKEN` on the server; public repository analysis can use unauthenticated GitHub API access within its rate limits. The same fine-grained token can publish to selected repositories with Contents read/write. Tokens stay in server environment variables. Project data contains no credentials.

The hosted workflow loads active projects from Supabase and prepares isolated source checkouts as needed, so adding a project does not require editing the workflow or a checkout on the Mac. The workflow itself must still be deployed and configured. Legacy `<PROJECT_ID>_REPO` and `<PROJECT_ID>_GITHUB_TOKEN` overrides remain supported.

This local version does not implement user authorization or tenant-level access control. Project scoping separates operations and data within the admin. The server scheduler iterates configured projects; it is not started automatically on the Mac.

## Knowledge, editorial review and article history

**Knowledge** stores project facts and source URLs. Importing the configured website reads only its root and registered project pages, without following redirects. Imported or changed pages start disabled until reviewed. Only enabled entries reach the AI. This is reference retrieval, not independent internet fact-checking.

**Blog library** imports full published Markdown articles from the configured website checkout. Generation refreshes that library and combines it with managed drafts. Context selection includes up to eight related article texts (65,000 characters total), up to 200 recent article summaries, and up to 45,000 characters of enabled knowledge. Very long texts can be truncated. No embeddings or web research are used yet. Local imports reflect the local checkout; hosted runs fetch the repository using GitHub Actions.

The editorial pass checks facts against supplied sources, repetition, clarity, brand voice and links. Improvements save a new article version; the report lists changes and remaining issues. Publication requires a current successful review without blockers and a generated photo. Human approval is still automatic for scheduled articles. Technical failures or unresolved editorial blockers pause publication and appear in the article/calendar. AI review reduces errors but cannot guarantee factual accuracy.

Migration `003-content-workflow.sql` adds database-triggered snapshots, seeding a baseline for existing articles. All subsequent payload changes are saved. **Restore as new draft version** preserves later snapshots, uses optimistic concurrency and revokes approval. Earlier manual changes made before this migration cannot be reconstructed. Published articles cannot be restored through this UI.

## One photo per article

`OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-sunburst`. Each new article requests one landscape image at 1536×1024, high quality. Sharp converts it to WebP, strips metadata and tries quality 84/80/76 with widths 1536/1280/1024, targeting 350 KiB with a hard 512 KiB ceiling. No upscaling is performed. The photo is an illustrative AI image, not documentation of actual products or premises.

Draft photo bytes and generation metadata live in Supabase, not on the Mac. Publication adds `public/images/blog-<sha256>.webp` and the article Markdown file in the same Git commit. The `coverImage` path is reused by the blog card and the image on the article page. A new photo request is explicitly paid; old bytes remain available for restoring versions. Image prompts, model and reported usage are retained in the project's AI task records. Failed or uncertain requests are not retried automatically.

New AI articles keep the descriptive slug supplied by the model. Random ID suffixes are no longer appended. Only an actual collision adds the first available numeric suffix (`-2`, `-3`, …); the admin can edit draft URLs. Published URL changes require a separate redirect plan. The article screen includes a search-result preview and title/description/word counts. These checks do not guarantee search rankings.

**Publish now** is available directly on a draft. It checks the current revision, sets the publication date to now, runs the normal editorial/photo checks and publishes without a separate approval click. A linked calendar entry is updated after a commit exists, preventing a second scheduled publication. A failed check keeps the draft and its previous calendar date available for correction; a failed push retains the commit for safe retry.
