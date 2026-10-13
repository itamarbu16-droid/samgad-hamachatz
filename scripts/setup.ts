import { connection,closeDb,isDemo } from '../src/server/db';
import { seedDemo } from '../src/server/seed';
async function main() { await (await connection()).migrate(); if(isDemo()) { const result=await seedDemo(); console.log(`Synthetic local workspace ready. Sign in as ${result?.email}; use DEMO_PASSWORD from your local environment.`); } else console.log('Database migration completed. Provision approved accounts separately.'); }
main().catch(error=>{console.error(error instanceof Error?error.message:'Setup failed');process.exitCode=1;}).finally(closeDb);
