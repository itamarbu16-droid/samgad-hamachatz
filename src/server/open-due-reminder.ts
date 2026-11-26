import {and,eq,isNull,lte,sql} from 'drizzle-orm';
import type {Database} from './db';
import type {Principal} from './policy';
import {rhythmScope} from './rhythm';
import {rhythmItems as items,rhythmOccurrences as occurrences} from './schema';

// Read only: getRhythm can materialize records, and its route can flush mail.
export async function readPersonalRhythmDueTasks(db:Database,p:Principal,through:string){
 if(p.guest||['viewer','admin'].includes(p.role))return [];
 return db.select({id:occurrences.id,title:items.title,dueDate:occurrences.dueDate})
  .from(occurrences).innerJoin(items,eq(items.id,occurrences.itemId)).where(and(
   rhythmScope(p),eq(items.category,'task'),eq(items.frequency,'once'),eq(items.archived,false),eq(items.hasDeadline,true),
   lte(occurrences.dueDate,through),isNull(occurrences.completedAt),
   sql`${items.assigneeIds} @> ${JSON.stringify([p.userId])}::jsonb`,
   sql`not jsonb_exists(${occurrences.completions},${p.userId}) and not jsonb_exists(${occurrences.reports},${p.userId})`,
   sql`(${items.completionMode} <> 'shared' or not exists (
    select 1 from jsonb_array_elements_text(${items.assigneeIds}) as assigned(id)
    where jsonb_exists(${occurrences.reports},assigned.id) or jsonb_exists(${occurrences.completions},assigned.id)
   ))`,
  ));
}
