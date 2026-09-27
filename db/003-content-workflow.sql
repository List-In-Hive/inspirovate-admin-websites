CREATE TABLE IF NOT EXISTS inspirovate.knowledge (
 id text NOT NULL,site_id text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(site_id,id)
);
CREATE TABLE IF NOT EXISTS inspirovate.library (
 site_id text NOT NULL,slug text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(site_id,slug)
);
CREATE TABLE IF NOT EXISTS inspirovate.article_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,site_id text NOT NULL,article_id text NOT NULL,
 revision integer NOT NULL,payload jsonb NOT NULL,saved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS history_project_article ON inspirovate.article_history(site_id,article_id,id DESC);
CREATE OR REPLACE FUNCTION inspirovate.record_article_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.payload IS DISTINCT FROM OLD.payload THEN
  INSERT INTO inspirovate.article_history(site_id,article_id,revision,payload)
  VALUES(NEW.site_id,NEW.id,(NEW.payload->>'revision')::integer,NEW.payload);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS article_history ON inspirovate.articles;
CREATE TRIGGER article_history AFTER INSERT OR UPDATE ON inspirovate.articles FOR EACH ROW EXECUTE FUNCTION inspirovate.record_article_history();
INSERT INTO inspirovate.article_history(site_id,article_id,revision,payload)
 SELECT site_id,id,(payload->>'revision')::integer,payload FROM inspirovate.articles a
 WHERE NOT EXISTS(SELECT 1 FROM inspirovate.article_history h WHERE h.site_id=a.site_id AND h.article_id=a.id);
CREATE TABLE IF NOT EXISTS inspirovate.ai_tasks (
 site_id text NOT NULL,id text NOT NULL,article_id text NOT NULL,kind text NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(site_id,id)
);
CREATE TABLE IF NOT EXISTS inspirovate.media (
 site_id text NOT NULL,id text NOT NULL,metadata jsonb NOT NULL,bytes bytea NOT NULL,
 PRIMARY KEY(site_id,id),CHECK(octet_length(bytes)<=524288)
);
ALTER TABLE inspirovate.knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirovate.library ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirovate.article_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirovate.ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirovate.media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA inspirovate FROM PUBLIC;
