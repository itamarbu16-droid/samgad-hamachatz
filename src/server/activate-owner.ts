import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {eq} from 'drizzle-orm';
import {getDb} from './db';
import {getAuth} from './auth';
import {AppError} from './policy';
import * as s from './schema';
import {responsibilityDomains} from '../lib/responsibility-domains';
export async function activateOwner(input:unknown){
 const data=z.object({token:z.string().min(32).max(256),password:z.string().min(12).max(128)}).strict().parse(input);
 const expected=process.env.OWNER_ACTIVATION_TOKEN;
 if(!expected||expected.length<32||!timingSafeEqual(createHash('sha256').update(data.token).digest(),createHash('sha256').update(expected).digest()))throw new AppError(403,'קישור ההפעלה אינו תקין');
 const email=process.env.WORKSPACE_OWNER_EMAIL?.toLowerCase(),organizationId=process.env.WORKSPACE_ORGANIZATION_ID;
 if(!email||!z.string().email().safeParse(email).success||organizationId!=='romach-75')throw new AppError(503,'המרחב טרם הוגדר');
 if(!process.env.DATABASE_URL&&process.env.DEMO_MODE!=='true')throw new AppError(503,'המרחב ממתין לחיבור מסד הנתונים הנפרד שלו');
 const db=await getDb();
 const organizations=await db.select().from(s.organizations);
 if(organizations.some(row=>row.id!==organizationId))throw new AppError(409,'מסד הנתונים שייך למרחב אחר');
 const [settings]=await db.select().from(s.workspaceSettings).where(eq(s.workspaceSettings.organizationId,organizationId));
 if(settings)throw new AppError(409,'חשבון המנהל כבר הופעל. יש להיכנס עם הסיסמה שנבחרה');
 const existing=await db.select().from(s.user);
 // Never repurpose an existing application or an orphaned account.
 if(existing.length)throw new AppError(409,'נמצא חשבון קיים. נדרשת בדיקת ההקמה');
 const auth=await getAuth(true);
 const result=await auth.api.signUpEmail({body:{email,name:'סמג״ד רומח',password:data.password}});
 await db.transaction(async tx=>{
  await tx.insert(s.organizations).values({id:organizationId,name:'גדוד 75 — רומח'});
  await tx.insert(s.memberships).values({id:randomUUID(),organizationId,userId:result.user.id,role:'deputy',editAll:true});
  await tx.insert(s.workspaceSettings).values({organizationId,ownerId:result.user.id,publicRead:false});
  await tx.insert(s.workspaceAccessGrants).values({organizationId,userId:result.user.id,grantedBy:result.user.id});
  await tx.insert(s.domains).values(responsibilityDomains.map(domain=>({...domain,id:`${organizationId}:${domain.id}`,organizationId})));
  await tx.insert(s.companies).values(['א׳','ב׳','ג׳','ד׳'].map((name,index)=>({id:`${organizationId}:company-${index}`,name:`פלוגה ${name}`,organizationId})));
 });
 return {activated:true,email};
}
