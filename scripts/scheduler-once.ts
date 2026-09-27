import { schedulerTick } from "../lib/scheduler";
import { closeDatabase, connectionOptions, initializeDatabase } from "../lib/database";
async function main() {
  let stage: 'configuration' | 'database URL' | 'database connection' | 'schedule processing' = 'configuration';
  try {
    const missing = ['DATABASE_URL', 'OPENAI_API_KEY'].filter(key => !process.env[key]?.trim());
    if (process.env.GITHUB_ACTIONS && !process.env.FLOWERS_GITHUB_TOKEN?.trim() && !process.env.GITHUB_PROJECTS_TOKEN?.trim()) missing.push('PROJECTS_GITHUB_TOKEN');
    if (missing.length) {
      console.error(`Missing Actions secrets: ${missing.join(', ')}. Add them in repository Settings > Secrets and variables > Actions > Secrets, not Variables.`);
      process.exitCode = 1;
      return;
    }
    console.log('Required configuration is present. Secret values are never printed.');
    stage = 'database URL';
    connectionOptions(process.env.DATABASE_URL!);
    stage = 'database connection';
    console.log('Connecting to Supabase and checking database migrations...');
    await initializeDatabase();
    console.log('Database connection and migrations succeeded.');
    stage = 'schedule processing';
    console.log('Processing project schedules...');
    await schedulerTick();
    console.log('Schedule check complete. Review the admin calendar for individual article results.');
  }
  catch {
    const help = stage === 'database URL' ? 'DATABASE_URL must be a PostgreSQL connection URL with a password. Use the Supabase Session pooler on port 5432.'
      : stage === 'database connection' ? 'Check the DATABASE_URL Actions secret, database password, Supabase availability and network access. Render variables are not shared with Actions.'
      : 'Check project settings and the admin calendar. Another operation may hold the scheduler lock.';
    console.error(`Scheduler failed during ${stage}. ${help}`);
    process.exitCode=1;
  }
  finally { await closeDatabase(); }
}
void main().catch(() => { console.error("The operation could not be completed."); process.exitCode = 1; });
