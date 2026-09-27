import { schedulerTick } from "../lib/scheduler";
import { closeDatabase } from "../lib/database";
async function main() {
  try { if(!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY || (process.env.GITHUB_ACTIONS && !process.env.FLOWERS_GITHUB_TOKEN && !process.env.GITHUB_PROJECTS_TOKEN)) throw new Error('Missing configuration'); await schedulerTick(); console.log('Schedule check complete.'); }
  catch { console.error('The schedule could not be processed. Check the database connection and workflow secrets.');process.exitCode=1; }
  finally { await closeDatabase(); }
}
void main().catch(() => { console.error("The operation could not be completed."); process.exitCode = 1; });
