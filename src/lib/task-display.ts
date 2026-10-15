import { addDays } from './rhythm';
export const taskSorts = {
 deadline_desc:'תג״ב סיום — מהמאוחר למוקדם',
 deadline_asc:'תג״ב סיום — מהקרוב לרחוק',
 title:'שם המשימה',
 status:'מצב ביצוע',
} as const;
export type TaskSort=keyof typeof taskSorts;
export function taskTone(done:boolean,due:string|null,today:string) {
 if(done)return 'task-done';
 if(!due)return '';
 if(due<today)return 'task-overdue';
 if(due<=addDays(today,1))return 'task-due-soon';
 return '';
}
export function compareTasks(a:{title:string;dueDate:string|null;done:boolean;id:string},b:typeof a,sort:TaskSort) {
 if(sort==='title')return a.title.localeCompare(b.title,'he') || a.id.localeCompare(b.id);
 if(sort==='status' && a.done!==b.done)return Number(a.done)-Number(b.done);
 if(!a.dueDate && b.dueDate)return 1;
 if(a.dueDate && !b.dueDate)return -1;
 const direction=sort==='deadline_asc'?1:-1;
 return direction*(a.dueDate||'').localeCompare(b.dueDate||'') || a.title.localeCompare(b.title,'he') || a.id.localeCompare(b.id);
}
