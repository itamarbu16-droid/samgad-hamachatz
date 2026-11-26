// @vitest-environment happy-dom
import React,{act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import TrackingTables from '../src/components/tracking-tables';
import {emptyFlexibleTracker,changeTrackerCell,parseFlexibleTracker} from '../src/lib/flexible-tracker';
vi.mock('@/lib/offline',()=>({apiFetch:(...args:Parameters<typeof fetch>)=>fetch(...args)}));
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});

it('reopens a saved grid, edits a populated cell, adds data to the table, merges, saves and reopens',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 const entry={id:'synthetic-flex',title:'טבלת בדיקה',folderId:'trackers',version:1,creatorId:'u'};
 let conflict=false;
 let body=JSON.stringify(changeTrackerCell(emptyFlexibleTracker(),{row:'row-0',column:'column-0'},'ישן'));
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method==='PATCH'){if(conflict)return Response.json({error:'גרסה ישנה'},{status:409});body=JSON.parse(String(init.body)).body;entry.version++;return Response.json({entry:{id:entry.id}});}
  return Response.json(String(input)==='/api/documents'?{entries:[entry]}:{entry:{...entry,body}});
 });
 const props={userId:'u',role:'deputy',back:vi.fn(),addFile:vi.fn(),openFile:vi.fn(),refreshKey:0,folderId:'trackers',folders:[{id:'trackers',name:'מעקבים',parent:null,section:'library'}],navigate:vi.fn(),foldersChanged:vi.fn()};
 const findButton=(name:string,scope:ParentNode=host)=>Array.from(scope.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')||b.textContent)?.trim()===name)!;
 const cell=(name:string)=>host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
 function input(name:string,value:string){
  const node=cell(name);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
 }
 try{
  await act(async()=>root.render(h(TrackingTables,props)));
  await act(async()=>host.querySelector<HTMLButtonElement>('.tracker-draggable')!.click());
  expect(cell('שורה 1, עמודה 1').value).toBe('ישן');
  await act(async()=>input('שורה 1, עמודה 1','נערך'));
  await act(async()=>findButton('＋ שורה').click());
  await act(async()=>findButton('＋ עמודה').click());
  const dialog=document.querySelector('[role=dialog]')!;
  dialog.querySelector<HTMLInputElement>('input[name=name]')!.value='בדיקה';
  await act(async()=>dialog.querySelector('form')!.requestSubmit());
  await act(async()=>input('שורה 7, בדיקה','נוסף'));
  await act(async()=>findButton('בחירת טווח').click());
  await act(async()=>findButton('שורה 1, עמודה 1').click());
  await act(async()=>findButton('שורה 2, עמודה 2').click());
  await act(async()=>findButton('מיזוג תאים').click());
  expect(cell('שורה 1, עמודה 1').closest('td')?.colSpan).toBe(2);
  expect(cell('שורה 1, עמודה 1').closest('td')?.rowSpan).toBe(2);
  await act(async()=>findButton('שמירת המעקב').click());
  const saved=parseFlexibleTracker(JSON.parse(body))!;
  expect(saved.rows[0].cells['column-0']).toBe('נערך');
  expect(saved.rows[6].cells[saved.columns[4].id]).toBe('נוסף');
  expect(saved.merges).toHaveLength(1);
  await act(async()=>host.querySelector<HTMLButtonElement>('.tracker-draggable')!.click());
  expect(cell('שורה 1, עמודה 1').value).toBe('נערך');
  expect(cell('שורה 7, בדיקה').value).toBe('נוסף');
  await act(async()=>findButton('שינוי שם עמודה 1, עמודה 1').click());
  const rename=document.querySelector('[role=dialog]')!;
  rename.querySelector<HTMLInputElement>('input[name=name]')!.value='כותרת סינתטית חדשה';
  await act(async()=>rename.querySelector('form')!.requestSubmit());
  expect(cell('שורה 1, כותרת סינתטית חדשה').value).toBe('נערך');
  conflict=true;
  await act(async()=>findButton('שמירת המעקב').click());
  expect(host.querySelector('[role=alert]')?.textContent).toContain('לא דרסו');
  expect(cell('שורה 1, כותרת סינתטית חדשה').value).toBe('נערך');
  expect(parseFlexibleTracker(JSON.parse(body))?.columns[0].name).toBe('עמודה 1');
  conflict=false;
  await act(async()=>findButton('שמירת המעקב').click());
  await act(async()=>host.querySelector<HTMLButtonElement>('.tracker-draggable')!.click());
  expect(cell('שורה 1, כותרת סינתטית חדשה').value).toBe('נערך');
  expect(cell('שורה 7, בדיקה').value).toBe('נוסף');
  await act(async()=>findButton('בחירת טווח').click());
  await act(async()=>findButton('שורה 1, כותרת סינתטית חדשה').click());
  await act(async()=>findButton('פיצול תא ממוזג').click());
  expect(cell('שורה 2, עמודה 2')).not.toBeNull();
  expect(cell('שורה 1, כותרת סינתטית חדשה').value).toBe('נערך');
  await act(async()=>findButton('שמירת המעקב').click());
  expect(parseFlexibleTracker(JSON.parse(body))?.merges).toEqual([]);
 }finally{
  await act(async()=>root.unmount());host.remove();fetcher.mockRestore();
 }
});

it('creates a general tracker from the UI with the flexible default, names its columns directly and reopens it',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 let entry:{id:string;title:string;folderId:string;version:number;creatorId:string;body:string}|undefined;
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method==='POST'){
   const {title,folderId,body}=JSON.parse(String(init.body));
   entry={id:'new-flex',title,folderId,version:1,creatorId:'u',body};
   return Response.json({entry:{id:entry.id}});
  }
  return Response.json(String(input)==='/api/documents'?{entries:entry?[entry]:[]}:{entry});
 });
 const props={userId:'u',role:'deputy',back:vi.fn(),addFile:vi.fn(),openFile:vi.fn(),refreshKey:0,folderId:'trackers',folders:[{id:'trackers',name:'מעקבים',parent:null,section:'library'}],navigate:vi.fn(),foldersChanged:vi.fn()};
 const button=(text:string,scope:ParentNode=host)=>[...scope.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent)?.trim()===text)!;
 try{
  await act(async()=>root.render(h(TrackingTables,props)));
  await act(async()=>button('＋ מעקב חדש').click());
  const dialog=document.querySelector('[role=dialog]')!;
  expect(dialog.querySelector<HTMLSelectElement>('select[name=layout]')?.value).toBe('flexible');
  dialog.querySelector<HTMLInputElement>('input[name=title]')!.value='מעקב סינתטי חדש';
  await act(async()=>dialog.querySelector('form')!.requestSubmit());
  await act(async()=>button('שינוי שם עמודה 1, עמודה 1').click());
  const rename=document.querySelector('[role=dialog]')!;
  rename.querySelector<HTMLInputElement>('input[name=name]')!.value='כותרת ראשונה לבדיקה';
  await act(async()=>rename.querySelector('form')!.requestSubmit());
  await act(async()=>button('שמירת המעקב').click());
  expect(parseFlexibleTracker(JSON.parse(entry!.body))?.columns[0]).toMatchObject({id:'column-0',name:'כותרת ראשונה לבדיקה'});
  await act(async()=>host.querySelector<HTMLButtonElement>('.tracker-draggable')!.click());
  expect(host.querySelector('input[aria-label="שורה 1, כותרת ראשונה לבדיקה"]')).not.toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();fetcher.mockRestore();}
});

it('routes an authorized long press to the flexible editor, not the raw document; a viewer can only open it',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 const entry={id:'flex-context',title:'מעקב סינתטי לפי הקשר',folderId:'trackers',version:1,creatorId:'other',body:JSON.stringify(emptyFlexibleTracker())};
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method)throw Error('An open gesture must never write');
  return Response.json(String(input)==='/api/documents'?{entries:[entry]}:{entry});
 });
 const args={userId:'u',role:'deputy',back:vi.fn(),addFile:vi.fn(),openFile:vi.fn(),refreshKey:0,folderId:'trackers',folders:[{id:'trackers',name:'מעקבים',parent:null,section:'library'}],navigate:vi.fn(),foldersChanged:vi.fn()};
 const card=()=>host.querySelector<HTMLButtonElement>('.tracker-draggable')!;
 const dialog=()=>document.querySelector<HTMLElement>('[role=dialog]');
 const tap=()=>card().dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
 const touch=(target:EventTarget,type:string)=>{
  const event=new Event(type,{bubbles:true,cancelable:true});
  const finger={identifier:1,clientX:48,clientY:113};
  Object.defineProperties(event,{touches:{value:type==='touchstart'?[finger]:[]},changedTouches:{value:[finger]}});
  target.dispatchEvent(event);
 };
 const hold=()=>act(async()=>{touch(card(),'touchstart');await vi.advanceTimersByTimeAsync(480);touch(card(),'touchend');tap();});
 try{
  await act(async()=>root.render(h(TrackingTables,args)));
  vi.useFakeTimers();
  await hold();
  expect(dialog()?.classList.contains('document-context-sheet')).toBe(true);
  expect(host.querySelector('.flexible-tracker')).toBeNull();
  expect(fetcher).not.toHaveBeenCalledWith('/api/documents/flex-context',expect.anything());
  const edit=[...dialog()!.querySelectorAll('button')].find(button=>button.textContent?.trim()==='עריכה / שינוי שם')!;
  await act(async()=>edit.click());
  expect(host.querySelector('input[aria-label="שורה 1, עמודה 1"]')).not.toBeNull();
  expect(args.openFile).not.toHaveBeenCalled();
  await act(async()=>root.render(h(TrackingTables,{...args,role:'viewer'})));
  await hold();
  expect(dialog()).toBeNull();
  expect(host.querySelector('input[aria-label="שורה 1, עמודה 1"]')).toBeNull();
  expect(host.querySelector('.flexible-tracker')).not.toBeNull();
  expect(host.querySelector('[aria-label^="פעולות עבור "]')).toBeNull();
  expect(fetcher.mock.calls.every(([,init])=>!init?.method)).toBe(true);
 }finally{vi.useRealTimers();await act(async()=>root.unmount());host.remove();fetcher.mockRestore();}
});
