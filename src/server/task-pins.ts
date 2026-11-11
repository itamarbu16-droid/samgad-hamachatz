import {and,eq} from 'drizzle-orm';
import {getDb} from './db';
import {taskPins} from './schema';
import type {Principal} from './policy';
export async function getPins(p:Principal){
 const rows=await (await getDb()).select({key:taskPins.taskKey}).from(taskPins).where(and(eq(taskPins.organizationId,p.organizationId),eq(taskPins.userId,p.userId)));
 return rows.map(row=>row.key);
}
