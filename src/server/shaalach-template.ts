import {createHash} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {getDb} from './db';
import * as s from './schema';
import {canEditAll,localDate,type Principal} from './policy';
import {periodAnchor} from '../lib/rhythm-periods';
import type {Frequency} from '../lib/rhythm';
import {z} from 'zod';
const importSchema=z.object({ownerEmail:z.string().email(),items:z.array(z.object({title:z.string().min(1).max(300),frequency:z.enum(['daily','weekly','fortnightly','monthly','quarterly','semiannual','annual'])})).max(200)});
// Owner-supplied checklist lives in private deployment configuration, never in source.
export async function ensureOwnerShaalach(p:Principal){
 if(!canEditAll(p)||!process.env.SHAALACH_IMPORT_JSON)return;
 const parsed=importSchema.safeParse(JSON.parse(process.env.SHAALACH_IMPORT_JSON));
 if(!parsed.success)throw new Error('Invalid recurring checklist import configuration');
 const db=await getDb(),owner=p.workspaceOwnerId||p.userId;
 const [account]=await db.select({email:s.user.email}).from(s.user).where(eq(s.user.id,owner));
 if(account?.email.toLowerCase()!==parsed.data.ownerEmail.toLowerCase())return;
 const today=localDate();
 const existing=await db.select({title:s.rhythmItems.title,frequency:s.rhythmItems.frequency}).from(s.rhythmItems).where(and(eq(s.rhythmItems.organizationId,p.organizationId),eq(s.rhythmItems.creatorId,owner)));
 const values=parsed.data.items.filter(({title,frequency})=>!existing.some(item=>item.title===title&&item.frequency===frequency)).map(({title,frequency})=>({
  id:'shaalach-605:'+createHash('sha256').update(p.organizationId+':'+owner+':'+frequency+':'+title).digest('hex'),
  organizationId:p.organizationId,creatorId:owner,assigneeIds:[owner],title,
  description:'מתוך שעל״ח סמג״ד שהועלה ב־29.10.2026',frequency,
  startDate:periodAnchor(frequency as Frequency,today),completionMode:'individual',category:'task',hasDeadline:true
 }));
 if(values.length)await db.insert(s.rhythmItems).values(values).onConflictDoNothing();
}
