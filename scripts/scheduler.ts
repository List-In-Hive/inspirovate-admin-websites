import { schedulerTick } from "../lib/scheduler";
import { databaseConfigured, closeDatabase } from "../lib/database";
async function main() {
  let stopping=false;
  process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
  console.log('Scheduler started. Checking every 30 seconds; Pacific Time.');
  while(!stopping){
    if(databaseConfigured()){
      try{await schedulerTick();}catch{console.error('The scheduler is waiting for database access or another operation to finish.');}
    }
    for(let n=0;n<30&&!stopping;n++)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await closeDatabase();
}
void main().catch(() => { console.error("The operation could not be completed."); process.exitCode = 1; });
