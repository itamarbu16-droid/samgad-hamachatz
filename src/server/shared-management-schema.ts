import {sql} from "drizzle-orm";
import {getDb,type Database} from "./db";
const initialized=new WeakMap<Database,Promise<void>>();
export async function ensureSharedManagementSchema(){
 const db=await getDb();let pending=initialized.get(db);
 if(!pending){pending=(async()=>{
await db.execute(sql`CREATE TABLE IF NOT EXISTS custom_document_folders (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), name text NOT NULL, parent text, section text NOT NULL CHECK(section IN ('library','records')), client_request_id text NOT NULL, UNIQUE(organization_id,client_request_id))`);
await db.execute(sql`ALTER TABLE rhythm_groups ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`);
await db.execute(sql`ALTER TABLE rhythm_groups ADD COLUMN IF NOT EXISTS customized boolean NOT NULL DEFAULT false`);
})();initialized.set(db,pending);}
 try{await pending;}catch(error){initialized.delete(db);throw error;}
}
