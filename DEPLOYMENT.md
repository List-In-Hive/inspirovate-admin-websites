# Admin hosting and scheduler deployment

This repository contains the admin UI, Node.js API and scheduled publisher. The admin and the always-on worker run on Railway as two services from this repository. Client websites remain in their own repositories and on Netlify. Supabase already stores project data, drafts, history and image bytes.

## Deployment model

The source includes a Node.js/Docker runtime and password-protected hosted access. No hosting service or credentials are provisioned by these files. Hosted access fails closed without valid configuration. A successful health check does not mean deployment is complete. Netlify requires additional background-job and GitHub API adaptation before this version can be hosted there.

The local pilot continues to work at http://127.0.0.1:3100 with `npm start` after building, or `npm run dev`.

## Server runtime

- Node.js 24 and Git are included in `Dockerfile`.
- The Docker build excludes `.env*`, `.data`, `.git`, local dependencies and build output.
- `npm run start:server` requires server-provided `DATABASE_URL`, `OPENAI_API_KEY`, `GITHUB_PROJECTS_TOKEN`, `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`, and binds to `0.0.0.0` on `PORT` (3100 by default).
- Server mode sets `ADMIN_HOSTED=true` and obtains every project's source from GitHub, including Flowers. It never depends on a sibling Mac checkout.
- `GET /api/health` returns only process health. It does not test the database, authentication, AI or publishing.
- `.data` holds disposable Git checkouts. Persistent application data belongs in Supabase; no volume migration from the Mac is needed.
- Model overrides and credentials remain server-only environment variables.

## Hosted access

Set `ADMIN_PASSWORD` to a unique password of at least 20 characters and `ADMIN_SESSION_SECRET` to at least 32 random characters. Use a password manager. These settings are server-only and must never be committed. `ADMIN_ORIGIN` must be the exact HTTPS origin of the admin, without a path. Railway's generated `RAILWAY_PUBLIC_DOMAIN` is used if no explicit origin is provided; set `ADMIN_ORIGIN` when you attach a custom domain.

The sign-in page creates a signed eight-hour session in a Secure, HttpOnly, SameSite=Strict cookie. Every project API checks the session, exact Host and mutation Origin independently of the page. Rotating either secret revokes all sessions. **Sign out** clears the current browser cookie. A database-backed global limit allows ten sign-in attempts per fifteen-minute window across server instances; after the limit, even the correct password must wait for the window to expire. This is one shared administrator account, not multi-user authorization.

`railway.json` configures the admin web service (Dockerfile build, `npm run start:server`, health check `/api/health`). `railway.worker.json` configures the worker service. Uncertain paid requests are deliberately not retried automatically after a restart.

## Scheduler activation

The worker uses the `WEBSITES` GitHub environment. Add these secrets under Settings → Environments → WEBSITES, or as repository Actions secrets (not Variables):

- `DATABASE_URL`: the existing Supabase session pooler connection, port 5432.
- `OPENAI_API_KEY`: the project API key.
- `ANTHROPIC_API_KEY`: optional Claude key for the two-model pipeline. Add it on Railway as well.
- `PROJECTS_GITHUB_TOKEN`: a fine-grained token restricted to client website repositories, with Contents read/write. The workflow maps this Actions secret to `GITHUB_PROJECTS_TOKEN` in the application; keep the latter name on Railway and locally. GitHub does not allow custom secret names starting with `GITHUB_`. Organization approval may be required. This is separate from the automatic token used to check out the admin repository.

Optional Actions variables: `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL` and `ANTHROPIC_MODEL`.

Scheduled jobs remain disabled until the repository variable `BLOG_SCHEDULER_ENABLED` is `true`. **Actions → Blog scheduler → Run workflow** bypasses this gate and runs real generation/publication logic. Configure secrets and review active calendars before running it.

### Optional Supabase backup trigger

The native GitHub schedule may be delayed or dropped before a run appears. The optional backup keeps execution in the same GitHub workflow, using Supabase Cron to send a `repository_dispatch` event. It does not depend on the Mac or the Railway services being up.

**Configure scheduler backup → Run workflow → check** only verifies dispatch permission and available database extensions. It stores no credentials in Supabase and activates no cron job. The GitHub token must include this admin repository with **Contents: write**; publishing access to client repositories alone is insufficient. The permission probe uses an event with no matching workflow and does not generate articles.

After choosing this infrastructure option, run the same setup workflow with **install**. It enables `pg_cron` and `pg_net`, stores the existing `PROJECTS_GITHUB_TOKEN` encrypted in Supabase Vault, and configures `inspirovate-blog-dispatch` once an hour at minute 21 UTC. The token is transmitted only from the protected GitHub environment to the configured Supabase database, then used only against GitHub's API. Do not log or copy it into SQL snippets. The application schema and dispatch function are inaccessible to public roles.

The backup skips dispatch when no active project has automation enabled, or a native GitHub check has been recorded within 55 minutes. A recent manual check cannot suppress it. GitHub's existing concurrency group and database locks also apply to dispatched runs. The repository variable `BLOG_SCHEDULER_ENABLED` still gates actual automatic processing.

Verify an actual `repository_dispatch` run following a Supabase cron tick, then check the calendar's automatic heartbeat and article result. A successful setup workflow or HTTP 204 alone is not end-to-end verification. Supabase's `cron.job_run_details` tracks timer execution; `net._http_response` tracks HTTP delivery and is retained temporarily. Setup with **disable** deactivates only this backup and preserves native GitHub scheduling. Re-running **install** updates the stored token and re-enables the job, so rotate the backup credential there when the GitHub secret changes.

This is a workaround for native schedule delivery, not a repair of GitHub's internal scheduler. GitHub queue delays and token expiry can still prevent execution. The calendar warns when no automatic worker heartbeat has arrived for 90 minutes, allowing for the hourly interval and queue delays.

Once enabled, the workflow checks once an hour. A due article is processed on the next hourly check, potentially almost an hour after its target time; GitHub queue delays and website builds can add further delay. Check Actions results, Calendar heartbeat and individual publication status.

## Always-on worker on Railway

The worker runs `npm run worker`: a pass every minute that plans topics, prepares drafts, publishes and verifies for all active projects. `WORKER_CONCURRENCY` projects (default 3) run in parallel; each takes at most one paid step per pass, so editors are not locked out for long. It needs no public port and no admin password.

1. In Railway, create a service from the admin GitHub repository and the intended branch.
2. Under **Settings → Config-as-code**, set the path to `railway.worker.json`. It builds the existing Dockerfile and starts the worker. Do not use this file for a web service.
3. Add variables: `DATABASE_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_PROJECTS_TOKEN`, optionally `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`, `ANTHROPIC_MODEL`, `WORKER_CONCURRENCY` and `WORKER_INTERVAL_SECONDS`. Use shared variables in the Railway project so the admin and worker get the same values; they are not shared with GitHub.
4. Deploy and check the log for `Worker started`, then the calendar heartbeat (trigger `worker`).

The database pool grows to `WORKER_CONCURRENCY + 2` sessions; keep this within the Supabase session pooler limit (shared with the admin and Actions). Raise concurrency gradually and watch provider rate limits. A redeploy stops the worker after its current pass; a draft interrupted mid-request is not repeated automatically and shows in the calendar for a manual retry. Keep the GitHub workflow enabled as a backup; re-run the Supabase backup **install** once so it also yields to the worker.

## Deployment checklist

1. Choose and connect the hosting account.
2. Configure the hosted password and session secret.
3. Configure secrets separately on the hosting service and GitHub Actions; never paste them into chat or issues.
4. Deploy the admin. Verify anonymous requests cannot access data or actions, then test authenticated access to Supabase.
5. Verify GitHub access and review active calendars before the first scheduler run.
6. Confirm the live admin URL, scheduler heartbeat and a successful end-to-end publication.

## Railway setup (admin web service)

1. Create a Railway project and add a service from the admin GitHub repository and the intended branch. Leave Root Directory empty; the service reads `railway.json` (Dockerfile build, `npm run start:server`, health check).
2. Add variables: `DATABASE_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_PROJECTS_TOKEN`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, optionally the model overrides. Railway variables are not inherited from local files or GitHub Actions secrets. Put the shared ones in **Project → Shared variables** and reference them from both services.
3. **Settings → Networking → Generate Domain**. Railway supplies `PORT` and `RAILWAY_PUBLIC_DOMAIN`; the admin uses that domain as its origin. For a custom domain, add it there and set `ADMIN_ORIGIN=https://admin.example.com`.
4. Follow the deployment log until the service is healthy, then test login and Project settings → Check connections.
5. Add the second service for the worker as described in **Always-on worker on Railway**.

Railway does not sleep, so `.data` checkouts survive between requests but are still disposable: a redeploy starts empty and re-clones from GitHub.

Pushes to a connected branch can trigger deployment. Validate local changes before pushing. Website deployment is separate: follow [Connect a client website](public/docs/project-setup.md) for Netlify; do not deploy the admin repository as a client website.

## Operational checks

- Missing server configuration: check variable names on Railway. The Actions token secret name and Railway variable name intentionally differ.
- Permission denied creating `/app/.data`: use the Dockerfile that provisions this directory for the node user; do not add broad write permissions or store durable data there.
- Manual workflow succeeds but automatic checks are absent: inspect `event:schedule` and the backup's `repository_dispatch` runs, the enable variable, environment approvals, token expiry and the Calendar automatic heartbeat. A green manual run is insufficient evidence.
- Deploy the admin and worker from the same reviewed version. Older workers retain global locking and older article-preparation rules.
- Documentation under `public/docs` is generic and publicly downloadable. It contains no credentials; never put internal client notes there.
