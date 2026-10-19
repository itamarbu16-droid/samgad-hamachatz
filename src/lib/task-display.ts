import { addDays } from './rhythm';
export const taskSorts = {
 deadline_desc:'תג״ב סיום — מהמאוחר למוקדם',
 deadline_asc:'תג״ב סיום — מהקרוב לרחוק',
 title:'שם המשימה',
 status:'מצב ביצוע',
} as const;
export type TaskSort=keyof typeof taskSorts;
type FilterTask = { done:boolean; pending?:boolean; cancelled?:boolean; dueDate:string|null; urgent?:boolean; important?:boolean; ownerId?:string; creatorId?:string; assigneeIds?:string[]; status?:string };
export function hasPendingReport(reports:Record<string,string>,completions:Record<string,string>,userId?:string) {
 return userId ? Boolean(reports[userId] && !completions[userId]) : Object.keys(reports).some(id=>!completions[id]);
}
export function matchesTaskFilter(task:FilterTask,filter:string,today:string,userId?:string) {
 const active=!task.done && !task.cancelled;
 if(task.done && filter!=='completed')return false;
 switch(filter) {
  case 'all': return active;
  case 'mine': return task.ownerId===userId || Boolean(userId && task.assigneeIds?.includes(userId));
  case 'assigned': return task.creatorId===userId;
  case 'active': case 'open': return active;
  case 'actionable': return active && !task.pending;
  case 'pending': case 'pending_review': return active && Boolean(task.pending);
  case 'completed': return task.done;
  case 'today': return active && task.dueDate===today;
  case 'due_soon': return active && Boolean(task.dueDate && task.dueDate>=today && task.dueDate<=addDays(today,1));
  case 'tomorrow': return active && task.dueDate===addDays(today,1);
  case 'overdue': return active && Boolean(task.dueDate && task.dueDate<today);
  case 'urgent': return active && Boolean(task.urgent);
  case 'important': return Boolean(task.important);
  default: return task.status===filter;
 }
}
export function taskTone(done:boolean,due:string|null,today:string) {
 if(done)return 'task-done';
 if(!due)return '';
 if(due<today)return 'task-overdue';
 if(due<=addDays(today,1))return 'task-due-soon';
 return '';
}
export function compareTasks(a:{title:string;dueDate:string|null;done:boolean;id:string;pinned?:boolean},b:typeof a,sort:TaskSort) {
 if(sort==='title')return a.title.localeCompare(b.title,'he') || a.id.localeCompare(b.id);
 if(sort==='status' && a.done!==b.done)return Number(a.done)-Number(b.done);
 if(!a.dueDate && b.dueDate)return 1;
 if(a.dueDate && !b.dueDate)return -1;
 const direction=sort==='deadline_asc'?1:-1;
 return direction*(a.dueDate||'').localeCompare(b.dueDate||'') || Number(Boolean(b.pinned))-Number(Boolean(a.pinned)) || a.title.localeCompare(b.title,'he') || a.id.localeCompare(b.id);
}
