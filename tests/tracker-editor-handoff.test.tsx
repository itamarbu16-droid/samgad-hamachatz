// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import TrackingTables from '../src/components/tracking-tables';
import {emptyFlexibleTracker} from '../src/lib/flexible-tracker';
import {initialTrackingColumns} from '../src/lib/tracking-sheet';

const {api}=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('@/lib/offline',()=>({apiFetch:api}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

it('scrolls and focuses the read-only heading after opening either tracker format or creating, never when a draft exit is canceled',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 const entries=Array.from({length:26},(_,i)=>({id:'synthetic-'+i,title:'מעקב סינתטי '+i,folderId:'trackers',version:1,creatorId:'u',
  body:JSON.stringify(i===24?{kind:'tracking-table-v1',rows:[],columns:initialTrackingColumns}:emptyFlexibleTracker())}));
 api.mockImplementation(async(path:string,init?:RequestInit)=>{
  if(init?.method)throw Error('Opening or creating a draft must never persist data');
  return Response.json(path==='/api/documents'?{entries}:{entry:entries.find(e=>path.endsWith('/'+e.id))});
 });
 const props={userId:'u',role:'deputy',folderId:'trackers',folders:[{id:'trackers',name:'מעקבים',parent:null,section:'library'}],
  back:vi.fn(),addFile:vi.fn(),openFile:vi.fn(),refreshKey:0,navigate:vi.fn(),foldersChanged:vi.fn()};
 const scroll=vi.spyOn(HTMLElement.prototype,'scrollIntoView').mockImplementation(()=>{});
 const originalConfirm=Object.getOwnPropertyDescriptor(window,'confirm');
 const confirm=vi.fn().mockReturnValue(false);
 Object.defineProperty(window,'confirm',{value:confirm,configurable:true});
 const card=(index:number)=>host.querySelectorAll('button.tracker-draggable')[index] as HTMLButtonElement;
 const heading=()=>host.querySelector('.tracking-editor h2');
 const title=()=>host.querySelector<HTMLInputElement>('.tracking-editor label input')!;
 try{
  await act(async()=>root.render(<TrackingTables {...props}/>));
  await act(async()=>card(25).click());
  expect(document.activeElement).toBe(heading());
  expect(heading()?.getAttribute('tabindex')).toBe('-1');
  expect(host.querySelector('.flexible-tracker')).not.toBeNull();
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(scroll).toHaveBeenLastCalledWith({block:'start',inline:'nearest'});

  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(title(),'טיוטה שלא נשמרה');
   title().dispatchEvent(new Event('input',{bubbles:true}));
  });
  card(24).focus();
  await act(async()=>card(24).click());
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(title().value).toBe('טיוטה שלא נשמרה');
  expect(document.activeElement).not.toBe(heading());
  expect(scroll).toHaveBeenCalledTimes(1);

  confirm.mockReturnValue(true);
  await act(async()=>card(24).click());
  expect(host.querySelector('.tracking-company-table')).not.toBeNull();
  expect(document.activeElement).toBe(heading());
  expect(scroll).toHaveBeenCalledTimes(2);

  const add=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('מעקב חדש'))!;
  await act(async()=>add.click());
  const modal=document.querySelector('[role=dialog]')!;
  modal.querySelector<HTMLInputElement>('input[name=title]')!.value='מעקב חדש סינתטי';
  await act(async()=>modal.querySelector('form')!.requestSubmit());
  expect(document.activeElement).toBe(heading());
  expect(title().value).toBe('מעקב חדש סינתטי');
  expect(scroll).toHaveBeenCalledTimes(3);
  expect(api.mock.calls.every(([,init])=>!init?.method)).toBe(true);
 }finally{
  await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();
  if(originalConfirm)Object.defineProperty(window,'confirm',originalConfirm);
  else Reflect.deleteProperty(window,'confirm');
 }
});
