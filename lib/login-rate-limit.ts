import { query } from './database';
// One administrator: a database-backed global budget survives process restarts
// and cannot be bypassed by spoofing proxy/IP headers or using another instance.
export async function allowLoginAttempt() {
  const row = (await query(`INSERT INTO inspirovate.login_attempts(id,attempts) VALUES ('admin',1)
    ON CONFLICT(id) DO UPDATE SET
      attempts=CASE WHEN login_attempts.started_at < now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
      started_at=CASE WHEN login_attempts.started_at < now()-interval '15 minutes' THEN now() ELSE login_attempts.started_at END
    RETURNING attempts`)).rows[0];
  return row.attempts <= 10;
}
