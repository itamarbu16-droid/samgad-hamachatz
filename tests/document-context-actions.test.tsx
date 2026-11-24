// @vitest-environment happy-dom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import DocumentLibrary from '../src/components/document-library';
import {documentFolders} from '../src/lib/document-folders';

const mock=vi.hoisted(()=>({api:vi.fn(),pending:[],store:{acknowledge:vi.fn()}}));
vi.mock('@/lib/offline',()=>({apiFetch:mock.api}));
vi.mock('../src/components/document-upload-provider',()=>({
 DocumentUploadJob:()=>null,
 useDocumentUpload:()=>({store:mock.store,pendingDocuments:mock.pending}),
}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const syntheticFolder={id:'synthetic-folder',parent:null,name:'Synthetic folder',section:'library'};
const trackerFolder={id:'synthetic-tracker-folder',parent:'trackers',name:'Synthetic nested tracker folder',section:'library'};
const entry=(id:string,title:string,creatorId:string,folderId=syntheticFolder.id)=>({id,title,creatorId,folderId,preview:'',body:'Synthetic body',documentDate:null,version:1,attachments:[],updatedAt:'2026-01-01'});
const own=entry('own-doc','Synthetic own file','actor');
const other=entry('other-doc','Synthetic other file','other');
const tracking=entry('tracker-doc','Synthetic tracker file','other','trackers');
let cleanup:()=>Promise<void>;
afterEach(async()=>{await cleanup?.();vi.useRealTimers();vi.clearAllMocks();});

async function setup(role:string,editAll=false){
 const entries=[own,other,tracking];
 mock.api.mockImplementation(async(url:string,init?:RequestInit)=>{
   if(init?.method)throw Error('A read-only gesture triggered a mutation');
   if(url==='/api/documents')return Response.json({entries,folders:[...documentFolders,syntheticFolder,trackerFolder]});
   return Response.json({entry:entries.find(item=>url.endsWith('/'+item.id))});
 });
 const host=document.createElement('div');
 document.body.append(host);
 const root=createRoot(host);
 cleanup=async()=>{await act(async()=>root.unmount());host.remove();};
 const item=(label:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.querySelector('strong')?.textContent===label)!;
 const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.getAttribute('aria-label')===label||el.textContent?.trim()===label)!;
 const dialog=()=>document.querySelector<HTMLElement>('[role=dialog]');
 const click=async(el:HTMLButtonElement)=>{await act(async()=>el.click());};
 const pointer=(el:Element,type:string,x=12)=>el.dispatchEvent(new PointerEvent(type,{cancelable:true,bubbles:true,pointerType:'touch',pointerId:1,isPrimary:true,button:0,clientX:x,clientY:12}));
 const attributedClick=(element:HTMLElement)=>element.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));
 const hold=async(el:HTMLElement)=>act(async()=>{pointer(el,'pointerdown');await vi.advanceTimersByTimeAsync(520);pointer(el,'pointerup');attributedClick(el);});
 const dismiss=()=>act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 await act(async()=>root.render(<DocumentLibrary section="library" userId="actor" role={role} editAll={editAll}/>));
 return {item,button,dialog,click,hold,dismiss,pointer,attributedClick};
}

it('anchors the Files-style highlight and menu beside the card, traps focus and closes on backdrop',async()=>{
 const u=await setup('deputy');
 vi.useFakeTimers();
 const card=u.item(syntheticFolder.name);
 const rectangle=vi.spyOn(card,'getBoundingClientRect').mockReturnValue(new DOMRect(175,window.innerHeight-90,140,60));
 const menuHeight=vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(220);
 try {
  await u.hold(card);
  const dialog=u.dialog()!;
  const backdrop=dialog.parentElement!;
  const spotlight=backdrop.querySelector<HTMLElement>('.document-context-spotlight')!;
  expect(backdrop.classList.contains('document-context-anchored')).toBe(true);
  expect(card.classList.contains('document-context-lifted')).toBe(true);
  expect(spotlight.style.left).toBe('175px');
  expect(spotlight.style.width).toBe('140px');
  expect(parseFloat(dialog.style.top)).toBeLessThan(window.innerHeight-90);
  expect(document.activeElement).toBe(dialog);
  expect(backdrop.getAttribute('aria-hidden')).toBeNull();
  expect(spotlight.getAttribute('aria-hidden')).toBe('true');
  await act(async()=>{u.pointer(backdrop,'pointerdown');u.attributedClick(backdrop);});
  expect(u.dialog()).toBeNull();
  expect(card.classList.contains('document-context-lifted')).toBe(false);
  expect(document.activeElement).toBe(card);
  expect(u.item(own.title)).toBeUndefined();
  await act(async()=>card.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true})));
  expect(u.dialog()?.getAttribute('aria-label')).toBe('פעולות: '+syntheticFolder.name);
 }finally {rectangle.mockRestore();menuHeight.mockRestore();}
});

it('lets a designated editor open the expected folder and document menus by touch without opening the target',async()=>{
 const u=await setup('contributor',true);
 vi.useFakeTimers();
 await u.hold(u.item(syntheticFolder.name));
 expect(u.dialog()?.getAttribute('aria-label')).toBe('פעולות: '+syntheticFolder.name);
 expect(u.dialog()?.classList.contains('document-context-sheet')).toBe(true);
 expect(u.item(own.title)).toBeUndefined();
 await u.dismiss();
 await u.click(u.item(syntheticFolder.name));
 await u.hold(u.item(other.title));
 expect(u.dialog()?.getAttribute('aria-label')).toBe('פעולות: '+other.title);
 expect(u.dialog()?.textContent).toContain('עריכת מסמך / שינוי שם');
 expect(u.dialog()?.textContent).toContain('העברה לתיקייה');
 expect(u.dialog()?.textContent).toContain('גזירה');
 expect(mock.api).not.toHaveBeenCalledWith('/api/documents/other-doc',expect.anything());
 // A stray synthetic release cannot choose a destructive option, and a new explicit tap can.
 const deletion=u.button('מחיקה');
 await act(async()=>u.attributedClick(deletion));
 expect(u.dialog()?.getAttribute('aria-label')).toBe('פעולות: '+other.title);
 await act(async()=>{u.pointer(deletion,'pointerdown');u.attributedClick(deletion);});
 expect(u.dialog()?.getAttribute('aria-label')).toBe('מחיקת פריט');
 expect(mock.api.mock.calls.every(([,init])=>!init?.method)).toBe(true);
});

it('supports the accessible ellipsis, escapes back to the trigger and still opens a normal tap',async()=>{
 const u=await setup('deputy');
 const ellipsis=u.button('עריכת תיקייה '+syntheticFolder.name);
 ellipsis.focus();
 await u.click(ellipsis);
 await u.dismiss();
 expect(document.activeElement).toBe(ellipsis);
 await u.click(ellipsis);
 await u.click(u.button('עריכת תיקייה / שינוי שם או מיקום'));
 expect(u.dialog()?.getAttribute('aria-label')).toBe('עריכת תיקייה');
 await u.dismiss();
 await u.click(u.item(syntheticFolder.name));
 vi.useFakeTimers();
 const card=u.item(own.title);
 await act(async()=>{
   u.pointer(card,'pointerdown');await vi.advanceTimersByTimeAsync(100);u.pointer(card,'pointerup');u.attributedClick(card);
 });
 expect(u.dialog()?.getAttribute('aria-label')).toBe(own.title);
});

it('cancels a moving or canceled gesture, without accidentally revealing actions',async()=>{
 const u=await setup('deputy');
 vi.useFakeTimers();
 const card=u.item(syntheticFolder.name);
 await act(async()=>{
  u.pointer(card,'pointerdown');u.pointer(card,'pointermove',30);await vi.advanceTimersByTimeAsync(600);u.pointer(card,'pointerup',30);
 });
 expect(u.dialog()).toBeNull();
 await act(async()=>{
  u.pointer(card,'pointerdown');u.pointer(card,'pointercancel');await vi.advanceTimersByTimeAsync(600);u.pointer(card,'pointerup');
 });
 expect(u.dialog()).toBeNull();
});

it('does not add an editor menu for readers or ordinary contributors, but retains legacy management of their own document',async()=>{
 const u=await setup('contributor');
 vi.useFakeTimers();
 expect(u.button('עריכת תיקייה '+syntheticFolder.name)).toBeUndefined();
 await u.click(u.item(syntheticFolder.name));
 expect(u.button('פעולות עבור '+own.title)).toBeUndefined();
 expect(u.button('פעולות עבור '+other.title)).toBeUndefined();
 await u.hold(u.item(other.title));
 expect(u.dialog()?.getAttribute('aria-label')).toBe(other.title);
 expect(u.button('פעולות נוספות · העברה / מחיקה')).toBeUndefined();
 await u.dismiss();
 await u.click(u.item(own.title));
 await u.click(u.button('פעולות נוספות · העברה / מחיקה'));
 expect(u.dialog()?.classList.contains('document-context-sheet')).toBe(false);
 expect(u.dialog()?.textContent).toContain('עריכת מסמך / שינוי שם');
});

it('a viewer still opens files and folders, but has neither menu nor editing shortcut',async()=>{
 const u=await setup('viewer');
 vi.useFakeTimers();
 expect(u.button('עריכת תיקייה '+syntheticFolder.name)).toBeUndefined();
 await u.hold(u.item(syntheticFolder.name));
 expect(u.dialog()).toBeNull();
 expect(u.item(other.title)).toBeDefined();
 await u.hold(u.item(other.title));
 expect(u.dialog()?.getAttribute('aria-label')).toBe(other.title);
 expect(u.button('פעולות נוספות · העברה / מחיקה')).toBeUndefined();
});

it('keeps tracker-folder gestures and the tracker file’s existing actions reachable',async()=>{
 const u=await setup('deputy');
 await u.click(u.item('מעקבים'));
 const folder=u.item('📁 '+trackerFolder.name);
 vi.useFakeTimers();
 await u.hold(folder);
 expect(u.dialog()?.getAttribute('aria-label')).toBe('פעולות: '+trackerFolder.name);
 await u.dismiss();
 await u.click(u.button('פעולות עבור '+tracking.title));
 expect(u.dialog()?.classList.contains('document-context-sheet')).toBe(true);
 expect(u.dialog()?.textContent).toContain('עריכה / שינוי שם');
 expect(u.dialog()?.textContent).toContain('שכפול לשבוע נוסף');
});
