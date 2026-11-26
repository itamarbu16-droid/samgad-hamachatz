// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SwipeTaskRow} from '../src/components/task-actions';
import Workspace from '../src/components/workspace';

vi.mock('../src/lib/offline',()=>({apiFetch:(...args:Parameters<typeof fetch>)=>fetch(...args),clearOffline:()=>Promise.resolve(),offlineStatus:async()=>[]}));
vi.mock('../src/components/push-settings',()=>({PushAutoRestore:()=>null,PushSettings:()=>null}));

Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();history.replaceState({},'','/');});
const click=async (button:HTMLElement)=>{await act(async()=>button.click());};
const byLabel=(label:string,within:ParentNode=host)=>Array.from(within.querySelectorAll('button')).find(node=>node.textContent?.trim()===label||node.getAttribute('aria-label')===label)!;
const settle=async()=>{await act(async()=>new Promise(resolve=>setTimeout(resolve,330)));};
const preview=()=>host.querySelector<HTMLAnchorElement>('.command-task')!;
const attention=()=>host.querySelector<HTMLElement>('.open-due-reminder');
const pointer=(target:Element,type:string,x:number,y:number,id=1)=>target.dispatchEvent(new PointerEvent(type,{clientX:x,clientY:y,isPrimary:true,pointerType:'touch',pointerId:id,button:0,bubbles:true,cancelable:true}));
const touch=(target:Element,type:string,clientX:number,clientY:number)=>{
 const event=new Event(type,{bubbles:true,cancelable:true});
 const point={identifier:7,clientX,clientY};
 Object.defineProperties(event,{
  touches:{value:type==='touchend'||type==='touchcancel'?[]:[point]},
  changedTouches:{value:[point]},
 });
 target.dispatchEvent(event);
 return event.defaultPrevented;
};
async function swipe(target:Element,dx:number,dy=2,cancel=false){
 await act(async()=>{
  pointer(target,'pointerdown',50,90);
  pointer(target,'pointermove',50+dx/2,90+dy/2);
  pointer(target,cancel?'pointercancel':'pointerup',50+dx,90+dy);
 });
}
async function setup(manager:boolean){
 const user={id:'fixture',name:'Synthetic',role:'deputy',organizationId:'fixture-space',permissions:{editAll:manager,manageAccess:manager,guest:false}};
 const today='2026-11-24';
 const tasks=['אחת','שתיים','שלוש','ארבע','חמש','שש'].map((title,i)=>({id:String(i+1),title,status:'open',comments:[],ownerId:user.id,creatorId:'someone-else',dueDate:`2026-11-${23+i}`}));
 const reads:Record<string,unknown>={
  '/api/workspace':{user,tasks,decisions:[],domains:[],users:[user],companies:[],activity:[],demo:true,today},
  '/api/rhythm':{today,month:today.slice(0,7),items:[],occurrences:[],groups:[],people:[]},
  '/api/deadline-requests':[],
  '/api/calendar/agenda':{connected:false,events:[]},
 };
 const fetch=vi.fn(async(url:string,init?:RequestInit)=>Response.json(init?.method&&init.method!=='GET'?{error:'Synthetic test must not write'}:reads[url.split('?')[0]]??{}));
 vi.stubGlobal('fetch',fetch);
 history.replaceState({},'',manager?'/':'/deputies');
 await act(async()=>root.render(<Workspace/>));
 return {fetch,changeOrganization:(id:string)=>{user.organizationId=id;}};
}
function assertReadOnly(fetch:ReturnType<typeof vi.fn>){
 expect(fetch.mock.calls.map(call=>call[1]?.method??'GET').every(method=>method==='GET')).toBe(true);
}
function viaMobile(label:string){return click(byLabel(label,host.querySelector('.mobile-nav')!));}

it.each([true,false])('advances just one open item, never writes, and restarts after leaving Home (manager = %s)',async manager=>{
 const {fetch}=await setup(manager);
 expect(preview().textContent).toContain('אחת');
 expect(preview().getAttribute('href')).toContain('task=1');
 expect(host.querySelectorAll('.command-task')).toHaveLength(manager?4:5);
 await swipe(preview(),-110);
 await swipe(preview(),5,110);
 await swipe(preview(),110,0,true);
 await swipe(preview(),30);
 expect(preview().textContent).toContain('אחת');
 const area=preview().closest('.home-preview-row')!;
 const front=area.querySelector<HTMLElement>('.home-preview-front')!;
 await act(async()=>{
  pointer(preview(),'pointerdown',50,90);
  pointer(preview(),'pointermove',84,93);
 });
 expect(front.dataset.motion).toBe('drag');
 expect(front.style.getPropertyValue('--swipe-motion-x')).toBe('34px');
 await act(async()=>pointer(preview(),'pointercancel',160,93));
 expect(front.dataset.motion).toBe('return');
 expect(front.style.getPropertyValue('--swipe-motion-x')).toBe('0px');
 expect(preview().textContent).toContain('אחת');
 await swipe(preview(),110);
 expect(area.classList.contains('swipe-motion-collapse')).toBe(true);
 expect(preview().textContent).toContain('אחת');
 await act(async()=>{
  const strayClick=new MouseEvent('click',{detail:1,bubbles:true,cancelable:true});
  expect(area.dispatchEvent(strayClick)).toBe(false);
 });
 await settle();
 expect(preview().textContent).toContain('שתיים');
 expect(host.querySelectorAll('.command-task')).toHaveLength(manager?4:5);
 expect(host.querySelector('.home-preview-enter')?.textContent).toContain(manager?'חמש':'שש');
 const next=byLabel('דילוג בתצוגה: שתיים');
 next.focus();
 await click(next);
 await settle();
 expect(preview().textContent).toContain('שלוש');
 expect(document.activeElement?.getAttribute('aria-label')).toBe('דילוג בתצוגה: שלוש');
 await viaMobile('משימות');
 await viaMobile('ראשי');
 expect(preview().textContent).toContain('אחת');
 assertReadOnly(fetch);
});

it('hides attention for this launch only, across menu/tab switches, and leaves responsibility directly addressable',async()=>{
 const {fetch,changeOrganization}=await setup(true);
 expect(attention()?.textContent).toContain('אחת');
 await swipe(attention()!,4,100);
 expect(attention()).toBeTruthy();
 const card=attention()!;
 await act(async()=>{
  // Exercise the iOS-compatible native TouchEvent fallback independently.
  touch(card,'touchstart',50,90);
  expect(touch(card,'touchmove',55,130)).toBe(false);
  touch(card,'touchend',55,133);
  touch(card,'touchstart',50,90);
  expect(touch(card,'touchmove',96,93)).toBe(true);
 });
 expect(card.style.getPropertyValue('--swipe-motion-x')).toBe('46px');
 await act(async()=>{touch(card,'touchend',160,93);});
 expect(card.dataset.motion).toBe('exit');
 expect(attention()).toBe(card);
 await settle();
 expect(attention()).toBeNull();
 expect(preview()).toBeTruthy();
 await viaMobile('עוד');
 expect(byLabel('אחריות',document.querySelector('[role=dialog]')!)).toBeUndefined();
 await click(document.querySelector<HTMLButtonElement>('[role=dialog] button[aria-label]')!);
 expect(byLabel('אחריות')).toBeUndefined();
 // Plain task-link activation stays in-app; modified clicks keep native behavior.
 await act(async()=>{
  const nativeClick=new MouseEvent('click',{button:0,ctrlKey:true,bubbles:true,cancelable:true});
  let handledByApp:boolean|undefined;
  document.addEventListener('click',event=>{handledByApp=event.defaultPrevented;event.preventDefault();},{once:true});
  preview().dispatchEvent(nativeClick);
  expect(handledByApp).toBe(false);
 });
 expect(location.search).toBe('');
 await click(preview());
 expect(new URLSearchParams(location.search).get('task')).toBe('1');
 await viaMobile('משימות');
 await viaMobile('ראשי');
 expect(attention()).toBeNull();
 await act(async()=>{history.pushState({},'','/?view=domains');window.dispatchEvent(new PopStateEvent('popstate'));});
 expect(host.textContent).toContain('תמונת מצב לפי תחום');
 await viaMobile('ראשי');
 expect(attention()).toBeNull();
 changeOrganization('other-fixture-space');
 await act(async()=>window.dispatchEvent(new Event('samgad:saved')));
 expect(attention()).toBeTruthy();
 changeOrganization('fixture-space');
 await act(async()=>window.dispatchEvent(new Event('samgad:saved')));
 expect(attention()).toBeNull();
 await act(async()=>root.unmount());
 root=createRoot(host);
 await act(async()=>root.render(<Workspace/>));
 expect(attention()).toBeTruthy();
 await click(byLabel('סגירת תזכורת משימות'));
 await viaMobile('משימות'); // Navigate before the 300 ms visual exit completes.
 await viaMobile('ראשי');
 expect(attention()).toBeNull();
 assertReadOnly(fetch);
});


it('restores the previous task rail on canceled touch and exposes the original actions only on commit',async()=>{
 await act(async()=>root.render(<SwipeTaskRow task={{kind:'task',id:'synthetic'}} title="בדיקה" pinned={false} canEdit canDelete><a href="#fixture">משימה</a></SwipeTaskRow>));
 const shell=host.querySelector<HTMLElement>('.swipe-task-shell')!;
 const front=host.querySelector<HTMLElement>('.swipe-task-front')!;
 const right=shell.querySelector('.task-underlay-right')!;
 const left=shell.querySelector('.task-underlay-left')!;
 await act(async()=>{
  touch(front,'touchstart',35,50);
  expect(touch(front,'touchmove',130,53)).toBe(true);
  touch(front,'touchcancel',130,53);
 });
 expect(right.getAttribute('aria-hidden')).toBe('true');
 expect(left.getAttribute('aria-hidden')).toBe('true');
 expect(shell.style.getPropertyValue('--swipe-offset')).toBe('0px');
 await act(async()=>{
  touch(front,'touchstart',155,50);
  touch(front,'touchmove',50,52);
  touch(front,'touchend',50,52);
 });
 expect(right.getAttribute('aria-hidden')).toBe('true');
 expect(left.getAttribute('aria-hidden')).toBe('false');
 expect(left.textContent).toContain('הוסף ליומן');
 expect(right.textContent).toContain('הצמדה');
});
