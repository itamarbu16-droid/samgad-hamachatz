// @vitest-environment happy-dom
import React,{act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import TrackingTables from '../src/components/tracking-tables';
import {initialTrackingColumns} from '../src/lib/tracking-sheet';
vi.mock('@/lib/offline',()=>({apiFetch:(...args:Parameters<typeof fetch>)=>fetch(...args)}));
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});

it('keeps RTL controls outside horizontal scroll, focuses a new row, and saves/reopens a named custom column',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 const entry={id:'synthetic-table',title:'מעקב סינתטי',folderId:'trackers',version:1,creatorId:'viewer-test'};
 let body=JSON.stringify({kind:'tracking-table-v1',columns:initialTrackingColumns,rows:[{'company-a':'שם בדיקה','company-a:status':'v'}]});
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method==='PATCH'){body=JSON.parse(String(init.body)).body;entry.version++;return Response.json({entry:{id:entry.id}});}
  return Response.json(String(input)==='/api/documents'?{entries:[entry]}:{entry:{...entry,body}});
 });
 const props={userId:'viewer-test',role:'deputy',back:vi.fn(),addFile:vi.fn(),openFile:vi.fn(),refreshKey:0,folderId:'trackers',
  folders:[{id:'trackers',name:'מעקבים',parent:null,section:'library'}],navigate:vi.fn(),foldersChanged:vi.fn()};
 const button=(text:string,scope:ParentNode=host)=>Array.from(scope.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent)?.trim()===text)!;
 try{
  await act(async()=>root.render(h(TrackingTables,props)));
  await act(async()=>host.querySelector<HTMLButtonElement>('.tracker-draggable')!.click());
  const scroll=host.querySelector<HTMLElement>('.tracking-scroll')!;
  expect(scroll.dir).toBe('rtl');
  expect(scroll.contains(button('הוספת עמודה'))).toBe(false);
  await act(async()=>button('הוספת שורה בסוף הטבלה').click());
  expect(scroll.querySelectorAll('tbody tr')).toHaveLength(51);
  expect((document.activeElement as HTMLElement)?.getAttribute('aria-label')).toContain('שורה 51');
  Object.defineProperty(scroll,'scrollHeight',{value:3000,configurable:true});
  scroll.scrollLeft=-150;
  await act(async()=>button('הוספת שורה בסוף הטבלה').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1})));
  expect(scroll.scrollLeft).toBe(-150);
  expect(scroll.scrollTop).toBe(3000);
  expect((document.activeElement as HTMLElement)?.getAttribute('aria-label')).not.toContain('שורה 52');
  await act(async()=>button('הוספת עמודה').click());
  const modal=document.querySelector('[role=dialog]')!;
  const input=modal.querySelector<HTMLInputElement>('[name=columnName]')!;
  input.value='עמודה סינתטית';
  await act(async()=>modal.querySelector<HTMLFormElement>('form')!.requestSubmit());
  expect(scroll.querySelector('thead')?.textContent).toContain('עמודה סינתטית');
  expect(scroll.querySelector('[aria-label="שם, עמודה סינתטית, שורה 51"]')).not.toBeNull();
  await act(async()=>button('שמירת המעקב').click());
  expect(JSON.parse(body).rows).toHaveLength(52);
  expect(JSON.parse(body).columns.at(-1).name).toBe('עמודה סינתטית');
  await act(async()=>host.querySelector<HTMLButtonElement>('.tracker-draggable')!.click());
  expect(scroll.querySelector('thead')?.textContent).toContain('עמודה סינתטית');
  expect((scroll.querySelector('[aria-label="סימון, א׳, שורה 1"]') as HTMLSelectElement)?.value).toBe('v');
  await act(async()=>root.render(h(TrackingTables,{...props,role:'viewer'})));
  expect(button('הוספת עמודה')).toBeUndefined();
  expect(button('הוספת שורה בסוף הטבלה')).toBeUndefined();
 }finally{
  await act(async()=>root.unmount());
  host.remove();
  fetcher.mockRestore();
 }
});
