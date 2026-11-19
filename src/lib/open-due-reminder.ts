import { addDays } from './rhythm';

export type DueReminderTask = { id:string; title:string; dueDate:string };
type LegacyTask = Omit<DueReminderTask,'dueDate'> & { dueDate:string|null; ownerId:string; status:string };

export function openDueReminderGroups({userId,today,tasks,rhythm}:{
 userId:string; today:string; tasks:readonly LegacyTask[]; rhythm:readonly DueReminderTask[];
}){
 const tomorrow=addDays(today,1);
 const entries:DueReminderTask[]=rhythm.filter(t=>t.dueDate<=tomorrow).map(t=>({...t,id:'rhythm:'+t.id}));
 for(const task of tasks){
  if(task.ownerId!==userId||!task.dueDate||task.dueDate>tomorrow||!['open','in_progress','blocked'].includes(task.status))continue;
  entries.push({id:'task:'+task.id,title:task.title,dueDate:task.dueDate});
 }
 entries.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.title.localeCompare(b.title,'he')||a.id.localeCompare(b.id));
 const overdue:DueReminderTask[]=[], soon:DueReminderTask[]=[];
 for(const entry of entries)(entry.dueDate<today?overdue:soon).push(entry);
 return {overdue,soon};
}
