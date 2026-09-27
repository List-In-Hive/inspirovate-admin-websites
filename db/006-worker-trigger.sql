ALTER TABLE inspirovate.worker ADD COLUMN IF NOT EXISTS automatic_heartbeat timestamptz;
ALTER TABLE inspirovate.worker ADD COLUMN IF NOT EXISTS last_trigger text;
