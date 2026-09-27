export function workerTrigger(env: Record<string, string | undefined> = process.env) {
  if (env.GITHUB_ACTIONS === 'true') {
    if (env.GITHUB_EVENT_NAME === 'repository_dispatch' && env.SCHEDULER_EVENT_ACTION === 'inspirovate-supabase-schedule') return 'supabase';
    return env.GITHUB_EVENT_NAME === 'schedule' ? 'schedule' : 'manual';
  }
  return 'local';
}

// A manual run must never make a stale automatic heartbeat look healthy.
export const heartbeatSql = `INSERT INTO inspirovate.worker(id,heartbeat,automatic_heartbeat,last_trigger)
  VALUES($1,now(),CASE WHEN $2 IN ('schedule','supabase') THEN now() ELSE NULL END,$2)
  ON CONFLICT(id) DO UPDATE SET heartbeat=now(),last_trigger=excluded.last_trigger,
  automatic_heartbeat=COALESCE(excluded.automatic_heartbeat,inspirovate.worker.automatic_heartbeat)`;

export function automaticWorkerActive(heartbeat: string | Date | null | undefined, now = Date.now()) {
  if (!heartbeat) return false;
  const age = now - new Date(heartbeat).getTime();
  return age >= 0 && age < 20 * 60 * 1000;
}
