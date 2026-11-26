// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import TrackingTables from '../src/components/tracking-tables';
import {parseFlexibleTracker} from '../src/lib/flexible-tracker';

const {api}=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('@/lib/offline',()=>({apiFetch:api}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

it('keeps prompt local, confirms only the edited flexible draft to the current folder, and can reopen it',async()=>{
 const host=document.createElement('div');
 document.body.append(host);
 const root=createRoot(host);
 let saved:{id:string;title:string;body:string;folderId:string;version:number;creatorId:string}|undefined;
 api.mockImplementation(async(path:string,init?:RequestInit)=>{
  if(init?.method==='POST'){
   const body=JSON.parse(String(init.body));
   saved={...body,id:'synthetic-assistant',version:1,creatorId:'fixture'};
   return Response.json({entry:saved});
  }
  if(init?.method)throw Error('Unexpected write');
  return Response.json(path==='/api/documents'?{entries:saved?[saved]:[]}:{entry:saved});
 });
 const props={userId:'fixture',role:'contributor',folderId:'nested',folders:[
  {id:'trackers',name:'מעקבים',parent:null,section:'library'},
  {id:'nested',name:'תיקיית בדיקה',parent:'trackers',section:'library'},
 ],back:vi.fn(),addFile:vi.fn(),openFile:vi.fn(),refreshKey:0,navigate:vi.fn(),foldersChanged:vi.fn()};
 const byText=(label:string,scope:ParentNode=document)=>Array.from(scope.querySelectorAll('button')).find(el=>el.textContent?.trim()===label)!;
 const click=async(el:HTMLElement)=>{await act(async()=>el.click());};
 const set=async(el:HTMLInputElement|HTMLTextAreaElement,value:string)=>{
  await act(async()=>{
   Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);
   el.dispatchEvent(new Event('input',{bubbles:true}));
  });
 };
 const writes=()=>api.mock.calls.filter(([,init])=>init?.method);
 try{
  await act(async()=>root.render(<TrackingTables {...props}/>));
  await click(byText('＋ מעקב חדש',host));
  await click(byText('תארו טבלה לעוזר'));
  const textarea=document.querySelector<HTMLTextAreaElement>('textarea[name=trackerPrompt]')!;
  await set(textarea,'מעקב בדיקה');
  await click(byText('הכנת תצוגה מקדימה'));
  expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toContain('אילו עמודות');
  expect(writes()).toHaveLength(0);
  await set(textarea,'שם: מעקב בדיקה; עמודות: פריט, כמות; שורות: 2\nשורה: דוגמה | 2');
  await click(byText('הכנת תצוגה מקדימה'));
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(host.querySelector('.tracking-editor')?.textContent).toContain('תצוגה מקדימה');
  expect(host.querySelector('.tracking-editor')?.textContent).toContain('תיקיית בדיקה');
  expect(writes()).toHaveLength(0);
  await set(host.querySelector<HTMLInputElement>('.tracking-editor label input')!,'בדיקה לאחר עריכה');
  await set(host.querySelector<HTMLInputElement>('input.flexible-tracker-cell')!,'דוגמה ערוכה');
  await click(byText('יצירת המעקב'));
  expect(writes()).toHaveLength(1);
  expect(writes()[0][0]).toBe('/api/documents');
  expect(writes()[0][1].body).not.toContain('שם:');
  expect(saved).toMatchObject({folderId:'nested',title:'בדיקה לאחר עריכה'});
  const grid=parseFlexibleTracker(JSON.parse(saved!.body));
  expect(grid?.rows.map(r=>r.cells)).toEqual([{'column-0':'דוגמה ערוכה','column-1':'2'},{}]);
  await click(host.querySelector('button.tracker-draggable')!);
  expect(host.querySelector<HTMLInputElement>('.tracking-editor label input')?.value).toBe('בדיקה לאחר עריכה');
  expect(host.querySelector<HTMLInputElement>('input.flexible-tracker-cell')?.value).toBe('דוגמה ערוכה');
  await act(async()=>root.render(<TrackingTables {...props} role="viewer"/>));
  expect(byText('＋ מעקב חדש',host)).toBeUndefined();
 }finally{
  await act(async()=>root.unmount());host.remove();
 }
});
