/** One-off, owner-authorized import into the existing application's configured workspace. */
import {and,eq,inArray} from 'drizzle-orm';
import {getDb,closeDb} from '../src/server/db';
import * as s from '../src/server/schema';
import {ensureOwnerShaalach} from '../src/server/shaalach-template';
import {materialize} from '../src/server/rhythm';
import {localDate,type Principal} from '../src/server/policy';
import {monthEnd} from '../src/lib/rhythm';
async function run(){
 if(!process.env.SHAALACH_IMPORT_JSON)return;
 if(process.env.VERCEL_PROJECT_ID!=='prj_pktl4SKuEO9E443R77FFe1p95N3M'||process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='feature/personal-rhythm')return;
 const config=JSON.parse(process.env.SHAALACH_IMPORT_JSON||'{}') as {organizationId?:string;items?:{title:string;frequency:string}[]};
 if(!config.organizationId||!config.items?.length)throw Error('Missing approved checklist configuration');
 const db=await getDb();
 const [workspace]=await db.select().from(s.workspaceSettings).where(eq(s.workspaceSettings.organizationId,config.organizationId));
 if(!workspace)throw Error('The configured workspace does not exist; no import was performed');
 const p:Principal={userId:workspace.ownerId,workspaceOwnerId:workspace.ownerId,organizationId:workspace.organizationId,role:'deputy',name:'Workspace owner',companyId:null,domainId:null};
 await ensureOwnerShaalach(p);
 const all=await db.select().from(s.rhythmItems).where(and(eq(s.rhythmItems.organizationId,p.organizationId),eq(s.rhythmItems.creatorId,p.userId)));
 const imported=all.filter(item=>config.items!.some(source=>source.title===item.title&&source.frequency===item.frequency));
 if(imported.length!==config.items.length)throw Error('Checklist row verification failed');
 await materialize(db,imported,monthEnd(localDate().slice(0,7)),localDate());
 const rows=await db.select({itemId:s.rhythmOccurrences.itemId}).from(s.rhythmOccurrences).where(inArray(s.rhythmOccurrences.itemId,imported.map(item=>item.id)));
 if(imported.some(item=>!rows.some(row=>row.itemId===item.id)))throw Error('Checklist occurrence verification failed');
 console.log(`Owner checklist import verified: ${imported.length} tasks with persisted period occurrences. No existing completions changed.`);
}
run().catch(()=>{console.error('Owner checklist import failed; no credentials or checklist contents are logged.');process.exitCode=1;}).finally(closeDb);
