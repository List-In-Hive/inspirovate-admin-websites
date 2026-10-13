# Inspirovate Admin

An English-language, multi-project blog admin built with Next.js, React-admin and a Node.js API. Each client website keeps its own GitHub repository and Netlify deployment. Supabase stores private project data. The admin and an always-on publishing worker run on Railway; GitHub Actions (optionally triggered by Supabase Cron) remains a backup scheduler. Production automation does not depend on a Mac.

## Documentation

- [Connect a client website](public/docs/project-setup.md): website build, GitHub, Netlify, forms, import and first publication.
- [Copyable website-building prompt](public/docs/website-prompt.md): a complete brief with the compatible blog and form contracts.
- [Developer publishing contract](public/docs/publication-contract.md): Markdown schema, hash, manifest and acceptance checks.
- [Admin hosting and scheduler deployment](DEPLOYMENT.md): Railway, credentials and automatic-worker activation.

The first three documents are also available in the shared **Documentation** sidebar section (`/#/documentation`), with Markdown downloads and **Copy website prompt**. The UI reads these exact files from `public/docs`; edit them here to update both versions. They are intentionally public, generic documentation: never add private notes or credentials to them. A code change must be deployed before hosted documentation changes.

## Local development

Use Node.js 24 from `.nvmrc` and Git:

```bash
nvm use
npm ci
cp .env.example .env.local
# Fill in server-side settings locally; never commit credentials.
npm run dev
```

Open http://127.0.0.1:3100. For a production preview, run `npm run build`, then `npm start`. Stop the old instance before starting another on this port. Local mode binds to loopback without login; hosted mode requires the password-protected server entry point described in DEPLOYMENT.md. APIs validate the host and mutation origin.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

These checks do not generate paid articles. Manual AI actions and scheduler runs can generate paid content or publish to real websites. Local and hosted admin instances using the same DATABASE_URL share real data; local testing is not an isolated database automatically.

## Server connections

Configure `.env.local` for local work, and hosting/Actions secrets separately for cloud execution:

- `DATABASE_URL`: Supabase **Connect → Session pooler**, port 5432; substitute the password and URL-encode special characters. Transaction pooling on port 6543 is unsupported because the app uses session advisory locks.
- `OPENAI_API_KEY`: server-only API key.
- `GITHUB_PROJECTS_TOKEN`: fine-grained token with Contents read/write on client repositories, for import and cloud publication. On GitHub Actions the secret is named **PROJECTS_GITHUB_TOKEN**, which the workflow maps to this application variable.
- `OPENAI_MODEL` and `OPENAI_IMAGE_MODEL`: optional model overrides; current defaults are in `.env.example` and the workflow.
- `ANTHROPIC_API_KEY`: optional server-only Claude key; `ANTHROPIC_MODEL` overrides the default `claude-opus-5-5`. Without it, OpenAI performs every step as before.
- `FLOWERS_REPO`: optional local Flowers checkout path; default `../flowers`. Hosted mode obtains project source from GitHub.

Restart after changing environment settings. **Project → Settings → Check connections** verifies database and configured model access without generating content. Supabase TLS certificate and hostname verification remain enabled; the public CA is bundled in `certs/`.

## Data and project isolation

The private `inspirovate` schema stores project catalog/profile data, articles and revisions, AI requests, enabled knowledge, synchronized article history, photo bytes, rules drafts, schedules and worker checks. These tables have no public Data API policies or grants; server-side PostgreSQL access is required. Netlify form submissions stay in Netlify, not this database.

`npm run db:migrate` creates/updates storage and imports the legacy local article file without overwriting existing records. Connect locally before starting the cloud worker if old Mac-only drafts need migration. Without DATABASE_URL, basic manual editing can use the legacy JSON store; AI and calendar features require Supabase. A configured but failing database does not silently fall back to local files.

Different projects can perform operations concurrently. The same project is serialized to protect revisions, topic history and publication. Local JSON storage retains a file-wide lock. Updated project locks coordinate with older global-lock workers, so deploy the admin and worker together for full cross-project concurrency. The scheduler itself currently loops through projects sequentially.

Removing a project archives it and pauses automation. Its data can be restored; this does not delete the client repository or website. Restoring leaves automation off. A push already sent can still finish deploying.

## Business rules and AI preparation

**Blog rules & settings** brings together Rules & format, Knowledge and Blog library. Set verified business facts, audience, tone, long-term goals, content areas and restrictions there. **Save draft settings** saves proposed rules; **Apply all rules** activates them for new generation. Project Settings holds the repository, live URL and connection checks.

New article defaults are 2 photos, 3 external links and 3 internal links. Counts are stored in each article's format snapshot, so later rule changes do not retrofit existing drafts. The pipeline checks counts and allowed destinations and stops when requirements cannot be met safely. The current text-length rule is 450–650 visible words, including headings and link labels.

The writer receives the project profile, enabled knowledge, article history, selected related text and the requested format. External-source research uses web search when required. Imported knowledge starts disabled until reviewed. Blog library supports topic diversity and existing-article context; historical links are not automatically trusted as valid current destinations.

With both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`, each article goes through two models. OpenAI prepares an SEO brief with web research (reader question, search intent, main search phrase, outline and source-backed facts); Claude writes the article from that brief; OpenAI audits the draft as an independent SEO editor; Claude revises it against the audit. Only pages actually retrieved during research may be cited. Images always use OpenAI. When one provider clearly refuses service (bad key, quota, outage), the other performs that step; timeouts are ambiguous and are not handed over automatically. Without a Claude key the previous OpenAI-only flow runs unchanged.

Generation uses structured text output (up to 7,000 output tokens), a separate editorial pass and the configured number of images. AI revisions also receive the saved article and editing instruction. Requests use `store: false`; known usage and results are recorded. Ambiguous paid requests are not automatically retried. Check provider usage before deliberately starting a replacement request after a timeout.

Each generated image is requested at 1536×1024 and optimized to WebP (up to 1536 px wide, target 350 KiB, hard limit 512 KiB). Images are saved individually in Supabase so an interrupted preparation can retain completed work. The cover is reused on the listing and article; additional photos appear in the body. Publication commits all required image assets to the client repository. Text edits require renewed editorial checking before publication.

## Manual and automatic publication

Create a draft through **Articles → New article** or **Create with AI**. Review it, resolve preparation issues and use **Publish now** to send the latest saved version immediately. This updates an associated calendar slot to prevent a later duplicate. Saved future publication dates are handled through Calendar, not by leaving a future date in a manual immediate-publication request.

The publisher validates the article, writes Markdown and WebP assets into an isolated checkout, commits and pushes the project's configured branch. Netlify builds through its Git integration. Published source versions are locked in this admin; edit already-published content through Git for now.

**Publishing** means sent but not fully verified. **Published** requires a matching production manifest and commit, content hash, plain H1, description, canonical URL and accessible article photos. Preview pages recheck every 20 seconds while open. The current exact-commit requirement can also fail after a newer unrelated deployment; inspect the expected commit and build before retrying. See the publishing contract for details.

## Calendar

Each project publishes in monthly **cycles** that start on its own day (1–28, default: the day the project was added; older projects keep day 1). Settings per project: articles per cycle (1–28), time zone, publication hour, how many days before the cycle topics are planned (default 10) and how long topics wait for review (default 3). Dates are spread evenly across the cycle; times are displayed and edited in the browser's local time zone.

1. **Topic plan.** At the planning date one paid request proposes a distinct reader question, main search phrase, intent and angle for every open slot, avoiding past, planned and catalog topics. Slots are marked before the request, so an interrupted plan is never paid for twice; it shows as failed and AI then chooses the topic at writing time.
2. **Review.** Approve all topics, edit any topic (a person's topic counts as approved) or request new proposals. Unreviewed topics are approved automatically when the review window ends.
3. **Drafts.** All drafts of the cycle are then prepared (one per project per worker pass) and wait for edits. **Create now** prepares a slot early. The late policy keeps a 24-hour review window when a draft is prepared late, or publishes immediately if chosen.
4. **Publication.** The latest saved version publishes automatically on its date. Editorial blockers or missing photos put the slot in **Needs your edit**; it is retried after the article is saved again or with **Try again**. Other failures retry after 1, 3, 6 and 12 hours, then stop and wait for a person.

The always-on worker (`npm run worker`, see DEPLOYMENT.md) checks every minute and processes several projects in parallel, each under its own project lock. The hourly GitHub workflow remains a backup; overlapping runs skip a locked project. The optional Supabase backup skips dispatch while the worker or native GitHub cron has reported within 55 minutes. A heartbeat is evidence of a worker check, not proof that every article succeeded.

## Repository map

- `app/`: Next.js entry pages, protected API routes and login.
- `components/`: project-scoped React-admin screens and the shared Documentation page.
- `lib/`: database, generation, rules, scheduler, publishing and verification.
- `scripts/`: migration, runtime and worker entry points.
- `.github/workflows/`: hourly worker and optional Supabase backup setup.
- `public/docs/`: shared operator guides and website prompt.
- `tests/`: validation, workflow and isolation regression checks.

Deployment files describe reproducible configuration; they do not certify the current live service or activate anything by being present. Review pending changes locally before pushing or deploying.
