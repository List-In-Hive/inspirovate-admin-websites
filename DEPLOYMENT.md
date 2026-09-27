# Cloud deployment preparation

This repository contains the admin UI, Node.js API and scheduled publisher. Client websites remain in their own repositories and on Netlify. Supabase already stores project data, drafts, history and image bytes.

## Current state

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

Set `ADMIN_PASSWORD` to a unique password of at least 20 characters and `ADMIN_SESSION_SECRET` to at least 32 random characters. Use a password manager. These settings are server-only and must never be committed. `ADMIN_ORIGIN` must be the exact HTTPS origin of the admin, without a path. Render's `RENDER_EXTERNAL_URL` is used if no explicit origin is provided.

The sign-in page creates a signed eight-hour session in a Secure, HttpOnly, SameSite=Strict cookie. Every project API checks the session, exact Host and mutation Origin independently of the page. Rotating either secret revokes all sessions. **Sign out** clears the current browser cookie. A database-backed global limit allows ten sign-in attempts per fifteen-minute window across server instances; after the limit, even the correct password must wait for the window to expire. This is one shared administrator account, not multi-user authorization.

`render.yaml` is an optional Docker service blueprint using the Free plan for initial testing. It auto-generates the signing secret and requests the other secrets. Free services can sleep or restart and are not a durable job queue; uncertain paid requests are deliberately not retried automatically. No paid plan is selected by this file.

## Scheduler activation

Add these repository Actions secrets in GitHub Settings:

- `DATABASE_URL`: the existing Supabase session pooler connection, port 5432.
- `OPENAI_API_KEY`: the project API key.
- `GITHUB_PROJECTS_TOKEN`: a fine-grained token restricted to client website repositories, with Contents read/write. Organization approval may be required. This is separate from the automatic token used to check out the admin repository.

Optional Actions variables: `OPENAI_MODEL` and `OPENAI_IMAGE_MODEL`.

Scheduled jobs remain disabled until the repository variable `BLOG_SCHEDULER_ENABLED` is `true`. **Actions → Blog scheduler → Run workflow** bypasses this gate and runs real generation/publication logic. Configure secrets and review active calendars before running it.

Once enabled, the workflow checks every five minutes. GitHub queue delays and website builds mean publication is not guaranteed at an exact minute. Check Actions results, Calendar heartbeat and individual publication status.

## Remaining activation steps

1. Choose and connect the hosting account.
2. Configure the hosted password and session secret.
3. Configure secrets separately on the hosting service and GitHub Actions; never paste them into chat or issues.
4. Deploy the admin. Verify anonymous requests cannot access data or actions, then test authenticated access to Supabase.
5. Verify GitHub access and review active calendars before the first scheduler run.
6. Confirm the live admin URL, scheduler heartbeat and a successful end-to-end publication.
