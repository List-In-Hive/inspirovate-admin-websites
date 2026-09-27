import { initializeDatabase, closeDatabase } from "../lib/database";
async function main() {
  try { await initializeDatabase(); console.log("Supabase connected. Tables are ready and local articles have been imported."); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
  finally { await closeDatabase(); }
}
void main().catch(() => { console.error("The operation could not be completed."); process.exitCode = 1; });
