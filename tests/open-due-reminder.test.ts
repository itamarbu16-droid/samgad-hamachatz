import {expect,it} from 'vitest';
import {openDueReminderGroups} from '../src/lib/open-due-reminder';

it('classifies only the actual assignee’s actionable tasks in local day buckets through tomorrow',()=>{
 const today='2026-12-31';
 const task=(id:string, dueDate:string|null, status='open', ownerId='me')=>({id,title:id,dueDate,status,ownerId});
 const groups=openDueReminderGroups({userId:'me',today,
  tasks:[
   task('my-late','2026-12-29','blocked'),task('my-today',today,'in_progress'),task('my-tomorrow','2027-01-01'),
   task('other','2026-12-29','open','other'),task('pending',today,'pending_review'),task('completed',today,'completed'),
   task('archive',today,'archived'),task('cancelled',today,'cancelled'),task('later','2027-01-02'),task('undated',null),
  ],
  rhythm:[{id:'one',title:'rhythm one',dueDate:'2026-12-30'},{id:'two',title:'rhythm two',dueDate:'2027-01-01'}],
 });
 expect(groups.overdue.map(r=>r.id)).toEqual(['task:my-late','rhythm:one']);
 expect(groups.soon.map(r=>r.id)).toEqual(['task:my-today','task:my-tomorrow','rhythm:two']);
});
