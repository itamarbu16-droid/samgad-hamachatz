// @vitest-environment happy-dom
import React,{act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TaskActions,type TaskActionProps} from '../src/components/task-actions';
import {manualPhoneActionHeader,wantsManualPhoneDelivery} from '../src/lib/manual-task-reminder';

Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
const props:TaskActionProps={task:{kind:'task',id:'synthetic'},title:'משימת בדיקה',version:3,dueDate:null,
 pinned:false,canEdit:true,canDelete:true,onSaved:async()=>{}};
let host:HTMLDivElement,root:Root;
const dialog=()=>document.querySelector<HTMLElement>('[role=dialog]')!;
const find=(label:string)=>Array.from(dialog().querySelectorAll('button')).find(node=>node.textContent?.trim()===label);
const click=(target:HTMLButtonElement)=>act(async()=>target.click());
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
async function show(values:Partial<TaskActionProps>){
 await act(async()=>root.render(h(TaskActions,{...props,...values})));
 await click(host.querySelector<HTMLButtonElement>('.task-options')!);
}

it.each([
 {task:{kind:'task',id:'synthetic'} as const,expected:{kind:'task',id:'synthetic',version:3}},
 {task:{kind:'rhythm',id:'repeat',occurrenceId:'occurrence'} as const,expected:{kind:'rhythm',id:'repeat',occurrenceId:'occurrence',version:3,occurrenceVersion:8}},
])('confirms before posting the versioned reminder and reports that reminders are in-app only for $task.kind',async({task,expected})=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({created:6,throttled:4}));
 await show({task,occurrenceVersion:8,canRemind:true});
 expect(fetcher).not.toHaveBeenCalled();
 await click(find('שליחת תזכורת')!);
 expect(dialog().getAttribute('aria-label')).toBe('תזכורת לאחראים');
 expect(fetcher).not.toHaveBeenCalled();
 await click(find('שליחת תזכורת')!);
 expect(fetcher).toHaveBeenCalledOnce();
 const [route,request]=fetcher.mock.calls[0];
 expect(route).toBe('/api/push/task-reminder');
 expect(request?.method).toBe('POST');
 expect(wantsManualPhoneDelivery(new Headers(request?.headers))).toBe(true);
 expect(JSON.parse(String(request?.body))).toEqual(expected);
 const status=dialog().querySelector('[role=status]')?.textContent;
 expect(status).toContain('תזכורת זמינה באפליקציה ל־6');
 expect(status).toContain('לא נשלחה התראה לטלפון');
 expect(status).not.toContain('ספק ההתראות');
 expect(status).toContain('ל־4 כבר נוצרה תזכורת');
});

it('does not offer a reminder when task actions allow edits but not reminders',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');
 await show({canRemind:false});
 expect(find('שליחת תזכורת')).toBeUndefined();
 expect(find('מחיקת משימה')).toBeTruthy();
 expect(fetcher).not.toHaveBeenCalled();
});

it('separates provider acceptance and in-app fallback from phone receipt',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({created:3,throttled:0,accepted:1,notEnrolled:1,unconfirmed:1}));
 await show({canRemind:true});
 await click(find('שליחת תזכורת')!);
 expect(fetcher).not.toHaveBeenCalled();
 await click(find('שליחת תזכורת')!);
 const status=dialog().querySelector('[role=status]')?.textContent;
 expect(status).toContain('תזכורת זמינה באפליקציה ל־3');
 expect(status).toContain('ספק ההתראות קיבל את הבקשה עבור 1');
 expect(status).toContain('קבלה בטלפון לא אומתה');
 expect(status).toContain('אין מכשיר רשום');
 expect(status).toContain('לא התקבל אישור מהספק');
 expect(status).not.toContain('לא נשלחה התראה לטלפון.');
});

it('keeps old cached clients on in-app only and fails closed for unknown action versions',()=>{
 expect(wantsManualPhoneDelivery(new Headers({'Content-Type':'application/json'}))).toBe(false);
 expect(wantsManualPhoneDelivery(new Headers({[manualPhoneActionHeader]:'0'}))).toBe(false);
 expect(wantsManualPhoneDelivery(new Headers({[manualPhoneActionHeader]:'2'}))).toBe(false);
 expect(wantsManualPhoneDelivery(new Headers({[manualPhoneActionHeader]:'1'}))).toBe(true);
});
