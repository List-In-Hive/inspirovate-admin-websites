CREATE TABLE IF NOT EXISTS inspirovate.projects (
 id text PRIMARY KEY,
 repository text NOT NULL,
 payload jsonb NOT NULL,
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_repository ON inspirovate.projects(lower(repository));
ALTER TABLE inspirovate.projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inspirovate.projects FROM PUBLIC;
