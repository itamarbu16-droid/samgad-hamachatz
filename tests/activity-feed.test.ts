// @vitest-environment happy-dom
import React,{act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import ActivityFeed from '../src/components/activity-feed';
vi.mock('../src/lib/offline',()=>({apiFetch:(...args:Parameters<typeof fetch>)=>fetch(...args)}));
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:Root;
const items=[{id:'event-1',summary:'עדכון לבדיקה',actorName:'משתמש',createdAt:'2026-11-11T08:00:00Z'}];
const button=(text:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text)!;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('requires confirmation, cancels without mutation, then removes only on confirm',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({dismissed:true})),saved=vi.fn();
 await act(async()=>root.render(h(ActivityFeed,{items,onSaved:saved})));
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 expect(fetcher).not.toHaveBeenCalled();expect(document.body.textContent).toContain('הרשימה שלך בלבד');
 await act(async()=>button('ביטול').click());expect(fetcher).not.toHaveBeenCalled();
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 await act(async()=>button('מחיקה מהרשימה').click());
 expect(fetcher).toHaveBeenCalledWith('/api/activity/event-1',expect.objectContaining({method:'PATCH',body:JSON.stringify({dismissed:true})}));expect(saved).toHaveBeenCalledTimes(1);
});
it('restores a removed entry and does not offer deletion in task history',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({dismissed:false}));
 await act(async()=>root.render(h(ActivityFeed,{items,removed:true})));
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 expect(fetcher).toHaveBeenCalledWith('/api/activity/event-1',expect.objectContaining({body:JSON.stringify({dismissed:false})}));
 await act(async()=>root.render(h(ActivityFeed,{items,readOnly:true})));expect(host.querySelector('button')).toBeNull();
});
it('keeps confirmation visible on failure and allows retry',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:'אין חיבור'},{status:503}));
 await act(async()=>root.render(h(ActivityFeed,{items})));
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 await act(async()=>button('מחיקה מהרשימה').click());
 expect(document.querySelector('[role=alert]')?.textContent).toBe('אין חיבור');
 expect(button('מחיקה מהרשימה').disabled).toBe(false);
});

it('follows the horizontal drag, snaps back on cancel and only opens a delete confirmation after a committed swipe',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');
 await act(async()=>root.render(h(ActivityFeed,{items})));
 const front=host.querySelector<HTMLElement>('.swipe-motion-front')!;
 const gesture=(type:string,x:number,y=50)=>front.dispatchEvent(new PointerEvent(type,{isPrimary:true,button:0,pointerId:1,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}));
 await act(async()=>{gesture('pointerdown',50);gesture('pointermove',92);});
 expect(front.dataset.motion).toBe('drag');
 expect(front.style.getPropertyValue('--swipe-motion-x')).toBe('42px');
 await act(async()=>gesture('pointercancel',140));
 expect(front.dataset.motion).toBe('return');
 expect(front.style.getPropertyValue('--swipe-motion-x')).toBe('0px');
 expect(document.querySelector('[role=dialog]')).toBeNull();
 await act(async()=>{gesture('pointerdown',50);gesture('pointermove',100);gesture('pointerup',130);});
 expect(front.dataset.motion).toBe('exit');
 expect(document.querySelector('[role=dialog]')).toBeNull();
 await act(async()=>new Promise(resolve=>setTimeout(resolve,175)));
 expect(document.querySelector('[role=dialog]')?.textContent).toContain('הרשימה שלך בלבד');
 expect(fetcher).not.toHaveBeenCalled();
 await act(async()=>button('ביטול').click());
 expect(fetcher).not.toHaveBeenCalled();
 await act(async()=>root.render(h(ActivityFeed,{items,readOnly:true})));
 await act(async()=>{gesture('pointerdown',50);gesture('pointermove',125);gesture('pointerup',145);});
 expect(document.querySelector('[role=dialog]')).toBeNull();
 expect(fetcher).not.toHaveBeenCalled();
});
