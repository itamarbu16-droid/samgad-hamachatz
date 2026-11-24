// @vitest-environment happy-dom
import React,{act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TaskActions,TaskActionNotice,type TaskActionProps} from '../src/components/task-actions';

Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
const props: TaskActionProps={
 task:{kind:'task',id:'synthetic'},title:'משימת בדיקה',version:1,dueDate:null,
 pinned:false,canEdit:true,canDelete:true,onSaved:async()=>{},
};
let host:HTMLDivElement,root:Root;
const buttons=(root:ParentNode=document)=>Array.from(root.querySelectorAll('button'));
const button=(label:string,root?:ParentNode)=>buttons(root).find(b=>b.textContent?.trim()===label)!;
const dialog=()=>document.querySelector<HTMLElement>('[role=dialog]')!;
const click=(target:HTMLButtonElement)=>act(async()=>target.click());
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
async function show(values:Partial<TaskActionProps>={},children?:React.ReactNode){
 await act(async()=>root.render(h(React.Fragment,null,h(TaskActions,{...props,...values},children),h(TaskActionNotice))));
 const trigger=host.querySelector<HTMLButtonElement>('.task-options')!;
 expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
 await click(trigger);
 expect(dialog().classList.contains('document-context-sheet')).toBe(true);
 expect(dialog().getAttribute('aria-label')).toBe('פעולות משימה');
}

it('keeps the ellipsis and alternate action, lists delete last, and confirms before offering undo',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>Response.json({undoToken:'synthetic-undo'}));
 const alternate=vi.fn();
 await show({},h('button',{onClick:alternate},'פעולה נוספת'));
 expect(fetcher).not.toHaveBeenCalled();
 expect(buttons(dialog()).at(-1)?.textContent?.trim()).toBe('מחיקת משימה');
 await click(button('פעולה נוספת',dialog()));
 expect(alternate).toHaveBeenCalledOnce();
 expect(document.querySelector('[role=dialog]')).toBeNull();
 await click(host.querySelector<HTMLButtonElement>('.task-options')!);
 await click(button('מחיקת משימה',dialog()));
 expect(dialog().getAttribute('aria-label')).toBe('למחוק את המשימה?');
 expect(fetcher).not.toHaveBeenCalled();
 await click(button('ביטול',dialog()));
 expect(fetcher).not.toHaveBeenCalled();
 await click(host.querySelector<HTMLButtonElement>('.task-options')!);
 await click(button('מחיקת משימה',dialog()));
 await click(button('מחיקה',dialog()));
 expect(fetcher).toHaveBeenCalledOnce();
 expect(fetcher.mock.calls[0][0]).toBe('/api/task-actions');
 expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({id:props.task.id,action:'delete'});
 expect(button('בטל פעולה אחרונה',host)).toBeTruthy();
});
it('keeps permission-gated actions unavailable by ellipsis or swipe dispatch',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');
 await show({canDelete:false,canEdit:false});
 expect(button('מחיקת משימה',dialog())).toBeUndefined();
 expect(button('בקש הארכת תג״ב',dialog())).toBeUndefined();
 expect(button('הוסף ליומן',dialog())).toBeTruthy();
 await act(async()=>window.dispatchEvent(new CustomEvent('samgad:task-action',{detail:{key:'task:synthetic:',action:'delete'}})));
 expect(document.querySelector('[role=dialog]')).toBeNull();
 expect(fetcher).not.toHaveBeenCalled();
});
