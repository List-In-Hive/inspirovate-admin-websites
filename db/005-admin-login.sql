CREATE TABLE IF NOT EXISTS inspirovate.login_attempts (
  id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
REVOKE ALL ON inspirovate.login_attempts FROM PUBLIC, anon, authenticated;
