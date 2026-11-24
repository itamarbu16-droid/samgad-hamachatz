export const canRemindLegacy = (status:string,dueDate:string|null,today:string) =>
 Boolean(dueDate && dueDate<today && ['open','in_progress','blocked'].includes(status));

export function outstandingRhythmIds({assigneeIds,completionMode}: {assigneeIds:string[];completionMode:string}, {
 completedAt,completions,reports
}: {completedAt:string|null|Date;completions:Record<string,string>;reports:Record<string,string>}) {
 if(completedAt || (completionMode==='shared' && assigneeIds.some(id=>Boolean(completions[id]||reports[id]))))return [];
 return [...new Set(assigneeIds.filter(id=>id&&!completions[id]&&!reports[id]))];
}

export type ManualReminderResult={created:number;throttled:number};
