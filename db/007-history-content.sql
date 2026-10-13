-- Versions record content changes only. Status, errors, commits and revision bumps from scheduler retries
-- are workflow state, not new versions of the article.
CREATE OR REPLACE FUNCTION inspirovate.article_content(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('title',p->'title','slug',p->'slug','description',p->'description','publishedAt',p->'publishedAt',
  'coverImage',p->'coverImage','coverAlt',p->'coverAlt','body',p->'body','photos',p->'photos','sources',p->'sources','format',p->'format')
$$;
CREATE OR REPLACE FUNCTION inspirovate.record_article_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR inspirovate.article_content(NEW.payload) IS DISTINCT FROM inspirovate.article_content(OLD.payload) THEN
  INSERT INTO inspirovate.article_history(site_id,article_id,revision,payload)
  VALUES(NEW.site_id,NEW.id,(NEW.payload->>'revision')::integer,NEW.payload);
 END IF;
 RETURN NEW;
END $$;
-- One-time cleanup: keep the first snapshot of each run of identical content.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM inspirovate.migrations WHERE id='007-history-dedupe') THEN
  DELETE FROM inspirovate.article_history h USING (
   SELECT id, inspirovate.article_content(payload) IS NOT DISTINCT FROM
     lag(inspirovate.article_content(payload)) OVER (PARTITION BY site_id,article_id ORDER BY id) AS duplicate
   FROM inspirovate.article_history) d
  WHERE h.id=d.id AND d.duplicate;
  INSERT INTO inspirovate.migrations(id) VALUES('007-history-dedupe');
 END IF;
END $$;
