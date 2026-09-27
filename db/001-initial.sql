CREATE SCHEMA IF NOT EXISTS inspirovate;
REVOKE ALL ON SCHEMA inspirovate FROM PUBLIC;
CREATE TABLE IF NOT EXISTS inspirovate.migrations (
  id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inspirovate.articles (
  id text PRIMARY KEY, slug text UNIQUE NOT NULL, payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inspirovate.profile (
  id text PRIMARY KEY CHECK (id = 'flowers'), payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS inspirovate.generations (
  id uuid PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE inspirovate.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirovate.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirovate.generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA inspirovate FROM PUBLIC;

CREATE TABLE IF NOT EXISTS inspirovate.schedules(id text PRIMARY KEY,payload jsonb NOT NULL);
INSERT INTO inspirovate.schedules(id,payload) VALUES('flowers','{"perMonth":4,"enabled":true,"latePolicy":"review24h"}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS inspirovate.slots(id uuid PRIMARY KEY,site_id text NOT NULL DEFAULT 'flowers',month text NOT NULL,position integer NOT NULL,publish_at timestamptz NOT NULL,payload jsonb NOT NULL, UNIQUE(site_id,month,position));
CREATE TABLE IF NOT EXISTS inspirovate.worker(id text PRIMARY KEY,heartbeat timestamptz NOT NULL);
ALTER TABLE inspirovate.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirovate.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirovate.worker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA inspirovate FROM PUBLIC;
