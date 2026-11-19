// @vitest-environment happy-dom
import React,{act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import OpenDueReminder from '../src/components/open-due-reminder';
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});

it('shows concise RTL groups, hides other assignees, and dismisses without writing',async()=>{
 const host=document.createElement('div');
 const root=createRoot(host);
 try {
  await act(async()=>root.render(h(OpenDueReminder,{
   userId:'me',today:'2026-11-19',
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
  expect(host.querySelector('section')).toBeNull();
 } finally {
  await act(async()=>root.unmount());
 }
});


it('shows the reminder again on app resume, but not immediately after a brief switch',async()=>{
 const host=document.createElement('div'),root=createRoot(host);
 const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 const clock=vi.spyOn(Date,'now').mockReturnValue(10_000);
 const switchVisibility=async(state:'visible'|'hidden',at:number)=>{
  visibility.mockReturnValue(state);clock.mockReturnValue(at);
  await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
 };
 try{
  await act(async()=>root.render(h(OpenDueReminder,{userId:'me',today:'2026-11-19',tasks:[],
   rhythm:[{id:'x',dueDate:'2026-11-18',title:'משימה סינתטית'}]})));
  await act(async()=>host.querySelector('button')?.click());
  await switchVisibility('hidden',10_000);
  await switchVisibility('visible',11_000);
  expect(host.querySelector('section')).toBeNull();
  await switchVisibility('hidden',15_000);
  await switchVisibility('visible',46_000);
  expect(host.textContent).toContain('משימה סינתטית');
 }finally{
  await act(async()=>root.unmount());visibility.mockRestore();clock.mockRestore();
 }
});
