-- Optional infrastructure, installed explicitly. Not part of application migrations.
CREATE TABLE IF NOT EXISTS inspirovate.scheduler_dispatch (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  repository text NOT NULL,
  last_requested_at timestamptz,
  request_id bigint
);
ALTER TABLE inspirovate.scheduler_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inspirovate.scheduler_dispatch FROM PUBLIC;

CREATE OR REPLACE FUNCTION inspirovate.dispatch_scheduler() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  config inspirovate.scheduler_dispatch%ROWTYPE;
  github_token text;
  queued_request bigint;
BEGIN
  SELECT * INTO config FROM inspirovate.scheduler_dispatch WHERE id FOR UPDATE;
  IF NOT FOUND OR NOT config.enabled THEN RETURN NULL; END IF;
  IF config.last_requested_at > now() - interval '55 minutes' THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM inspirovate.projects p JOIN inspirovate.schedules s ON s.id=p.id
    WHERE p.archived_at IS NULL AND p.payload->>'localOnly' IS DISTINCT FROM 'true'
      AND s.payload->>'enabled' = 'true'
  ) THEN RETURN NULL; END IF;
  -- Native GitHub cron remains primary when it has checked recently.
  IF EXISTS (SELECT 1 FROM inspirovate.worker
    WHERE last_trigger='schedule' AND automatic_heartbeat > now() - interval '55 minutes')
    THEN RETURN NULL; END IF;
  IF config.repository !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' THEN
    RAISE EXCEPTION 'Invalid scheduler repository';
  END IF;
  SELECT decrypted_secret INTO github_token FROM vault.decrypted_secrets
    WHERE name='inspirovate_scheduler_github_token';
  IF github_token IS NULL OR length(github_token)=0 THEN
    RAISE EXCEPTION 'Scheduler dispatch credential is missing';
  END IF;
  SELECT net.http_post(
    url := 'https://api.github.com/repos/' || config.repository || '/dispatches',
    headers := jsonb_build_object('Authorization','Bearer ' || github_token,
      'Accept','application/vnd.github+json','Content-Type','application/json',
      'X-GitHub-Api-Version','2022-11-28'),
    body := jsonb_build_object('event_type','inspirovate-supabase-schedule'),
    timeout_milliseconds := 15000
  ) INTO queued_request;
  UPDATE inspirovate.scheduler_dispatch
    SET last_requested_at=now(),request_id=queued_request WHERE id;
  RETURN queued_request;
END;
$$;
REVOKE ALL ON FUNCTION inspirovate.dispatch_scheduler() FROM PUBLIC;
