import {connection,closeDb} from '../src/server/db';
async function main(){
 if(!process.env.DATABASE_URL){console.log('Romach deployment awaits its own DATABASE_URL; no existing workspace is used.');return;}
 if(process.env.WORKSPACE_ORGANIZATION_ID!=='romach-75')throw Error('Unexpected workspace identity');
 const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
 try{
  const exists=await pool.query("SELECT to_regclass('public.organizations') AS present");
  if(exists.rows[0].present){const organizations=await pool.query('SELECT id FROM organizations');if(organizations.rows.some(row=>row.id!=='romach-75'))throw Error('Database belongs to a different workspace');}
 }finally{await pool.end();}
 await (await connection()).migrate();console.log('Romach database schema ready. Owner activation is required.');
}
main().catch(()=>{console.error('Romach setup stopped: verify the dedicated database and workspace identity.');process.exitCode=1;}).finally(closeDb);
