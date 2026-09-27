# Validation — Supabase, AI and schedule

## GitHub onboarding and project lifecycle — September 26, 2026

- Projects now load from a private Supabase catalog; migration 004 preserved all existing article, profile, schedule and slot payloads by before/after digest. Flowers and its enabled setting remain unchanged.
- Added GitHub-link onboarding with bounded read-only source inspection, structural blog compatibility checks, paid AI profile suggestions, imported source notes and blog history, and paused-by-default setup review. Duplicate repository links return the existing project without another analysis.
- Added automatic-blog on/off, reversible removal, removed-project listing and restoration with automation off. Removed projects are excluded from API lookup and scheduling. Mutations recheck archive status under the shared worker lock.
- New cloud jobs load projects dynamically from Supabase and prepare source checkouts on the server. Repository hooks are disabled; source/image paths reject symlink escapes. No client repository code is executed during analysis.
- 31 tests pass, including onboarding persistence and failure fallback, duplicate paid-analysis prevention, activation gating, archive/restore preservation, stale-context mutation rejection, public URL validation, source exclusions and symlink protection. ESLint, TypeScript and production build pass.
- Read 21 selected files from the real Flowers GitHub repository without modifying it or invoking paid AI; its blog structure was recognized. A detected social-link ambiguity was fixed: live URL discovery now uses explicit website configuration or the GitHub homepage only, and otherwise requires an address during setup review.
- Browser verified dynamic Projects, Add project, automatic-blog switch, and duplicate Flowers link returning the existing settings page without a duplicate project or paid analysis.
- GITHUB_PROJECTS_TOKEN is not configured locally; public GitHub analysis works, while private repository onboarding needs that server credential. No new client project was added to the live database, no project was removed, no GitHub push or deployment was performed, and cloud scheduling remains undeployed.

## Ongoing automatic content strategy — September 26, 2026

- Project Settings now contains persistent blog goals, content areas and editorial rules. Existing profiles receive defaults on read while retaining all existing facts.
- Create next article and the scheduler select topics from the same saved strategy and article history. Per-article topic inputs are removed from the UI; calendar date editing preserves existing records.
- Removed the mandatory seasonal assignment. Writer/editor instructions prefer distinct useful reader questions and evergreen coverage, with optional justified seasonality.
- 27 tests pass, including topic-free generation replay after strategy changes and a rolling calendar producing 48 dates over a full year plus dates in the next year. Existing paid request recovery and project isolation remain covered.
- TypeScript, ESLint and production build pass. Browser verified populated strategy fields, creation without a topic field, and date editing without a topic selector. No paid generation, profile update or article publication was performed for these checks.
- Local admin restarted. No deployment or GitHub push; the cloud scheduler still needs activation after local testing.

## Knowledge, editorial workflow, photos and immediate publication — September 26, 2026

- 25 automated tests pass; TypeScript, ESLint and production build pass.
- Migration 003 preserved the existing two articles, profile, generation, schedule and four slots by before/after payload digest. New history captures subsequent versions, with existing articles baselined.
- Tests cover bounded related-article context, paid-task recovery, stale editorial reports, image optimization, project-scoped history/media, restoring a draft as a new version, and committing Markdown plus WebP together in a temporary Git repository.
- A real editorial request improved the existing uncommitted autumn draft. One real image request produced a 1536 × 1024 WebP of 156,580 bytes. The draft remains unpublished.
- The autumn draft now uses `flowers-for-early-autumn-changing-light`; published article URLs were not renamed.
- Publish now uses the latest saved draft, replaces its future date, and updates its calendar slot only after a publication commit. Unit coverage includes blocked publication and already-committed rejection.
- Browser checked the clean search preview, editorial Ready report, photo metadata, four historical versions, Publish now button and confirmation dialog; confirmation was cancelled without publishing.
- No GitHub push or live article publication performed. Cloud scheduler remains undeployed; local admin restarted for testing.

## Earlier integration checks

- Automated: Postgres DDL executed twice in PGlite; metadata/unique slug/RLS; TLS session-pooler rules.
- AI workflow: one paid-call simulation per request ID, stale request mismatch, recovery after storage failure, recovery after draft checkpoint, ambiguous timeout without automatic retry.
- Calendar: monthly partition, leap year, Pacific DST, nonexistent and ambiguous local time; 24-hour lead time.
- Scheduler: latest saved edit published without human approval; exactly-once completed slot; delayed generation policies; failed generation never publishes.
- Existing article frontmatter, approvals, dates, local API and real temporary Git retry tests retained.
- TypeScript, ESLint and production build checked locally.
- OpenAI: supplied key and access to configured model verified via a read-only API call. No paid generation performed yet.
- Live Supabase: TLS verified with the official CA, migration completed; one existing article preserved with matching ID/revision/commit/body. Four planned slots created; next publication 2026-10-01 08:00 Pacific.
- GitHub Actions cron is not deployed yet.

## Project workspace isolation — September 26, 2026

- Replaced global functional pages with `/projects/<id>` workspaces and project-specific Articles, Calendar, Create with AI and Settings.
- All functional API routes require a registered project ID. Verified the Flowers routes return 200, an unknown project returns 404, and legacy article/calendar/generation/profile routes return 404.
- 18 automated tests pass, including concurrent project contexts, foreign article edits/actions, local JSON preservation, database-scoped reads/writes, foreign generation/slot ID rejection, and identical slugs in different projects.
- Supabase migration verified all pre-existing payloads with a before/after digest: one article, one profile, zero generations, one schedule and four slots preserved exactly.
- Production build and lint passed. Browser checked project directory, overview, calendar with four Pacific dates, article creation, AI and project settings.
- Only Flowers is configured. No GitHub push, paid AI generation or publication was performed. The server scheduler remains undeployed; the local admin is available for testing.
