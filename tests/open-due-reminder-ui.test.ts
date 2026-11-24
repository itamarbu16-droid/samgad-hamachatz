// @vitest-environment happy-dom
import React,{act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import OpenDueReminder from '../src/components/open-due-reminder';
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});

it('shows concise RTL groups, hides other assignees, and dismisses without writing',async()=>{
 const host=document.createElement('div');
 const root=createRoot(host);
 const onDismiss=vi.fn();
 try {
  await act(async()=>root.render(h(OpenDueReminder,{
   onDismiss,userId:'me',today:'2026-11-19',
   tasks:[{id:'1',title:'משימה סינתטית באיחור',ownerId:'me',status:'open',dueDate:'2026-11-18'},
    {id:'2',title:'לא שייכת לי',ownerId:'other',status:'open',dueDate:'2026-11-18'}],
   rhythm:Array.from({length:4},(_,i)=>({id:String(i),title:'משימה קרובה '+i,dueDate:'2026-11-20'})),
  })));
  expect(host.querySelector('section')?.dir).toBe('rtl');
  expect(host.querySelector('section')?.getAttribute('aria-labelledby')).toBe(host.querySelector('h2')?.id);
  expect(host.querySelector('time')?.dateTime).toBe('2026-11-18');
  expect(host.textContent).not.toContain('לא שייכת לי');
  expect(host.textContent).toContain('להיום או למחר (4)');
  expect(host.querySelector('details summary')?.textContent).toBe('עוד 1');
  await act(async()=>host.querySelector('button')?.click());
  expect(onDismiss).toHaveBeenCalledOnce();
 } finally {
  await act(async()=>root.unmount());
 }
});
