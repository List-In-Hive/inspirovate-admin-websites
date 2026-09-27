# Cloud deployment preparation

This repository contains the admin UI, Node.js API and scheduled publisher. Client websites remain in their own repositories and on Netlify. Supabase already stores project data, drafts, history and image bytes.

## Current state

The source is prepared for a Node.js/Docker service. No hosting service or credentials are provisioned by these files. Hosted API requests deliberately fail closed until server-side access control is implemented and configured. A successful health check does not mean deployment is complete.

The local pilot continues to work at http://127.0.0.1:3100 with `npm start` after building, or `npm run dev`.

## Server runtime

- Node.js 24 and Git are included in `Dockerfile`.
- The Docker build excludes `.env*`, `.data`, `.git`, local dependencies and build output.
- `npm run start:server` requires server-provided `DATABASE_URL`, `OPENAI_API_KEY` and `GITHUB_PROJECTS_TOKEN`, and binds to `0.0.0.0` on `PORT` (3100 by default).
- Server mode sets `ADMIN_HOSTED=true` and obtains every project's source from GitHub, including Flowers. It never depends on a sibling Mac checkout.
- `GET /api/health` returns only process health. It does not test the database, authentication, AI or publishing.
- `.data` holds disposable Git checkouts. Persistent application data belongs in Supabase; no volume migration from the Mac is needed.
- Model overrides and credentials remain server-only environment variables.

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
2. Implement and configure the chosen hosted login/access method.
3. Configure secrets separately on the hosting service and GitHub Actions; never paste them into chat or issues.
4. Deploy the admin. Verify anonymous requests cannot access data or actions, then test authenticated access to Supabase.
5. Verify GitHub access and review active calendars before the first scheduler run.
6. Confirm the live admin URL, scheduler heartbeat and a successful end-to-end publication.
