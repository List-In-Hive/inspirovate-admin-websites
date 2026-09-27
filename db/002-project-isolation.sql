ALTER TABLE inspirovate.articles ADD COLUMN IF NOT EXISTS site_id text NOT NULL DEFAULT 'flowers';
ALTER TABLE inspirovate.articles DROP CONSTRAINT IF EXISTS articles_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS articles_project_slug ON inspirovate.articles(site_id,slug);
ALTER TABLE inspirovate.generations ADD COLUMN IF NOT EXISTS site_id text NOT NULL DEFAULT 'flowers';
CREATE INDEX IF NOT EXISTS generations_project_created ON inspirovate.generations(site_id,created_at DESC);
ALTER TABLE inspirovate.profile DROP CONSTRAINT IF EXISTS profile_id_check;
