import {addDays} from './rhythm';
export type SnapshotTask={done:boolean;dueDate:string|null};
export function summarizeTasks(tasks:SnapshotTask[],today:string){
 const tomorrow=addDays(today,1);
 return {total:tasks.length,completed:tasks.filter(t=>t.done).length,
 urgent:tasks.filter(t=>!t.done&&t.dueDate!==null&&t.dueDate>=today&&t.dueDate<=tomorrow).length,
 overdue:tasks.filter(t=>!t.done&&t.dueDate!==null&&t.dueDate<today).length};
}
export function isPersonalTask(task:{creatorId:string;ownerId:string},userId:string){return task.creatorId===userId&&task.ownerId===userId;}
