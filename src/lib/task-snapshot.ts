import {addDays} from './rhythm';
export type SnapshotTask={done:boolean;dueDate:string|null};
type PersonalRecord = {
 item: {frequency:string;archived:boolean;category:string;hasDeadline:boolean};
 occurrence: {done:boolean;dueDate:string};
};
/** The personal overview contains one-off tasks only. Recurring checklist
 * periods retain their own independent tracker and completion history. */
export function personalSnapshotTasks(records:PersonalRecord[],legacyTasks:{status:string;dueDate:string|null}[]):SnapshotTask[]{
 return [
  ...records.filter(({item})=>item.frequency==='once'&&!item.archived&&item.category!=='point').map(({item,occurrence})=>({done:occurrence.done,dueDate:item.hasDeadline?occurrence.dueDate:null})),
  ...legacyTasks.filter(task=>task.status!=='cancelled').map(task=>({done:task.status==='completed',dueDate:task.dueDate}))
 ];
}
export function summarizeTasks(tasks:SnapshotTask[],today:string){
 const tomorrow=addDays(today,1);
 return {total:tasks.length,completed:tasks.filter(t=>t.done).length,
 urgent:tasks.filter(t=>!t.done&&t.dueDate!==null&&t.dueDate>=today&&t.dueDate<=tomorrow).length,
 overdue:tasks.filter(t=>!t.done&&t.dueDate!==null&&t.dueDate<today).length};
}
export function isPersonalTask(task:{creatorId:string;ownerId:string},userId:string){return task.creatorId===userId&&task.ownerId===userId;}
