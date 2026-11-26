import {sql} from 'drizzle-orm';
import {getDb,type Database} from './db';
const initialized = new WeakMap<Database,Promise<void>>();
export async function ensureActivityDismissals(){
  const db=await getDb();
  let ready=initialized.get(db);
  if(!ready){
    ready=db.execute(sql`CREATE TABLE IF NOT EXISTS activity_dismissals (
      organization_id text NOT NULL REFERENCES organizations(id),
      user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
      event_id text NOT NULL REFERENCES audit_events(id) ON DELETE CASCADE,
      dismissed_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT activity_dismissals_user_event UNIQUE (organization_id,user_id,event_id)
    )`).then(()=>undefined);
    initialized.set(db,ready);
  }
  try{await ready;}catch(error){initialized.delete(db);throw error;}
  return db;
}
