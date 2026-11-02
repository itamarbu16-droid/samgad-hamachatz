import {addDays} from './rhythm';
export type SnapshotTask={done:boolean;dueDate:string|null};
type PersonalRecord = {
 item: {frequency:string;archived:boolean;category:string;hasDeadline:boolean};
 occurrence: {done:boolean;dueDate:string};
};
/** Personal task lists and overview cards share the same one-off boundary.
 * Recurring records remain available only in their dedicated checklist view. */
export const isPersonalOneOff = (item:{frequency:string}) => item.frequency==='once';
export function personalItemTab(item:{frequency:string;category:string}) {
 return !isPersonalOneOff(item)?'rhythm':item.category==='point'?'points':'tasks';
}
export function personalItemInTab(item:{frequency:string;category:string;archived:boolean},tab:string) {
 if(item.archived)return false;
 if(tab==='rhythm')return !isPersonalOneOff(item)&&item.category!=='point';
 return isPersonalOneOff(item)&&(tab==='points'?item.category==='point':item.category!=='point');
}
/** The personal overview contains one-off tasks only. Recurring checklist
 * periods retain their own independent tracker and completion history. */
export function personalSnapshotTasks(records:PersonalRecord[],legacyTasks:{status:string;dueDate:string|null}[]):SnapshotTask[]{
 return [
  ...records.filter(({item})=>personalItemInTab(item,'tasks')).map(({item,occurrence})=>({done:occurrence.done,dueDate:item.hasDeadline?occurrence.dueDate:null})),
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
