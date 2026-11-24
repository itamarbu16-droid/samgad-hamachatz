// @vitest-environment happy-dom
import {createRoot} from 'react-dom/client';
import {act} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import TrackingTables from '../src/components/tracking-tables';

const mock=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('@/lib/offline',()=>({apiFetch:mock.api}));
vi.mock('../src/components/use-tracker-drag',()=>({useTrackerDrag:()=>({consumeClick:()=>false})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});

const folder='synthetic-folder', title='Synthetic tracker';
const field='company-a';
let cleanup:()=>Promise<void>;
afterEach(async()=>{await cleanup?.();vi.useRealTimers();vi.clearAllMocks();});

async function lab(role="contributor"){
  const entry={id:'synthetic',title,version:1,creatorId:'editor-a',folderId:folder,
    body:JSON.stringify({kind:'tracking-table-v1',columns:[{id:field,name:'First',type:'text'}],rows:[{[field]:'Old',[field+':status']:'v','company-b':'Untouched B'},{[field]:'Replace',[field+':status']:'x','company-b':'Second B'},{[field]:'Original',[field+':status']:'v'}]})};
  const requestVersions:number[]=[];
  const differentEditorWrites=(changes:Record<number,string>)=>{
    const sheet=JSON.parse(entry.body);
    for(const [index,value] of Object.entries(changes)){
      sheet.rows[Number(index)-1][field]=value;
      if(!value)sheet.rows[Number(index)-1][field+':status']='';
    }
    entry.body=JSON.stringify(sheet);entry.version++;
  };
  let rejectStatus=0, changeBeforeSend:(()=>void)|null=null, readCount=0;
  mock.api.mockImplementation(async(url:string,init?:RequestInit)=>{
    if(init?.method==='PATCH'){
      const d=JSON.parse(String(init.body));requestVersions.push(d.version);changeBeforeSend?.();
      if(rejectStatus)return Response.json({error:'Permission or network blocked'},{status:rejectStatus});
      if(d.version!==entry.version)return Response.json({error:'צריך לרענן'},{status:409});
      entry.body=d.body;entry.title=d.title;entry.version++;
      return Response.json({entry:{id:entry.id}});
    }
    if(url==='/api/documents')return Response.json({entries:[entry]});
    readCount++;
    expect(init?.cache).toBe('no-store');
    return Response.json({entry});
  });

  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  cleanup=async()=>{await act(async()=>root.unmount());host.remove();};
  const button=(label:string)=>[...document.querySelectorAll('button')].find(element=>element.textContent?.trim()===label)!;
  const click=async(element:HTMLElement)=>{await act(async()=>{element.click();});};
  const open=()=>click([...host.querySelectorAll('button')].find(element=>element.textContent?.startsWith(title))!);
  const input=(n:number)=>host.querySelector<HTMLInputElement>('input[aria-label="שם, א׳, שורה '+n+'"]')!;
  const set=async(n:number,value:string)=>act(async()=>{
    const el=input(n);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const save=()=>click(button('שמירת המעקב'));
  const alert=()=>host.querySelector('.tracking-editor [role=alert]')?.textContent;
  const persisted=(n:number)=>JSON.parse(entry.body).rows[n-1][field];
  await act(async()=>root.render(<TrackingTables userId="editor-b" role={role} back={()=>{}} addFile={()=>{}} openFile={()=>{}} refreshKey={0} folderId={folder} folders={[{id:folder,name:'Synthetic',parent:'trackers',section:'library'}]} navigate={()=>{}} foldersChanged={()=>{}}/>));
  await open();
  const cellMenu=(n:number)=>click(host.querySelector<HTMLButtonElement>('button[aria-label="פעולות שם, א׳, שורה '+n+'"]')!);
  const menu=()=>document.querySelector('[role=dialog]');
  const press=(n:number,type:string,x=0)=>{
    input(n).dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:0}));
  };
  const getRow=(n:number)=>JSON.parse(entry.body).rows[n-1] as Record<string,string>;
  return {entry,requestVersions,cellMenu,menu,press,getRow,button,click,differentEditorWrites,readCount:()=>readCount,open,input,set,save,alert,persisted,
    reject:(status:number)=>{rejectStatus=status;},changeBeforeSend:(fn:()=>void)=>{changeBeforeSend=fn;}};
}

it('uses the current version normally and can save again without reopening',async()=>{
  const l=await lab();
  await l.set(1,'');await l.set(2,'New');await l.save();
  await l.set(2,'Another');await l.save();await l.open();
  expect(l.requestVersions).toEqual([1,2]);
  expect(l.input(1).value).toBe('');
  expect(l.input(2).value).toBe('Another');
});

it('rebases a cleared and replaced name while retaining a different editor’s cell; both survive reopening',async()=>{
  const l=await lab();
  await l.set(1,'');await l.set(2,'Replacement');
  l.differentEditorWrites({3:'Editor A value'});
  await l.save();
  expect(l.requestVersions).toEqual([1,2]);
  expect(l.alert()).toBeUndefined();
  expect(l.input(3).value).toBe('Editor A value');
  await l.open();
  expect([l.input(1).value,l.input(2).value,l.input(3).value]).toEqual(['','Replacement','Editor A value']);
  await l.set(1,'Third save');await l.save();
  expect(l.requestVersions).toEqual([1,2,3]);
});

it('keeps the entire draft and makes no second PATCH when both change the same cell',async()=>{
  const l=await lab();
  await l.set(1,'');await l.set(2,'Other draft value');
  l.differentEditorWrites({1:'Editor A value'});
  await l.save();
  expect(l.requestVersions).toEqual([1]);
  expect(l.alert()).toContain('בשורה 1');
  expect(l.input(1).value).toBe('');
  expect(l.input(2).value).toBe('Other draft value');
  expect(l.persisted(1)).toBe('Editor A value');
  expect(l.persisted(2)).toBe('Replace');
});

it('recognizes an identical concurrent clear without another write',async()=>{
  const l=await lab();
  await l.set(1,'');l.differentEditorWrites({1:''});
  await l.save();
  expect(l.entry.version).toBe(2);
  expect(l.requestVersions).toEqual([1]);
  expect(l.alert()).toBeUndefined();
});

it('never retries an authorization rejection',async()=>{
  const l=await lab();
  await l.set(1,'');l.reject(403);await l.save();
  expect(l.requestVersions).toEqual([1]);
  expect(l.readCount()).toBe(1);
  expect(l.alert()).toContain('Permission');
  expect(l.input(1).value).toBe('');
});

it('rebases again if a third editor saves during the retry, and preserves the latest value',async()=>{
  const l=await lab();
  await l.set(1,'');l.differentEditorWrites({3:'One external change'});
  l.changeBeforeSend(()=>{if(l.requestVersions.length===2)l.differentEditorWrites({3:'Another external change'});});
  await l.save();
  expect(l.requestVersions).toEqual([1,2,3]);
  expect(l.persisted(1)).toBe('');
  expect(l.persisted(3)).toBe('Another external change');
});

it('does not silently combine concurrent row appends',async()=>{
  const l=await lab();
  await act(async()=>{document.querySelector<HTMLButtonElement>('[aria-label="הוספת שורה"]')!.click();});
  await l.set(51,'My new row');
  const sheet=JSON.parse(l.entry.body);
  sheet.rows=Array.from({length:51},(_,i)=>sheet.rows[i]||{});
  sheet.rows[50][field]='Their new row';
  l.entry.body=JSON.stringify(sheet);l.entry.version++;
  await l.save();
  expect(l.requestVersions).toEqual([1]);
  expect(l.alert()).toContain('מבנה המעקב השתנה');
  expect(l.input(51).value).toBe('My new row');
  expect(l.persisted(51)).toBe('Their new row');
});


it('clears only the in-place name and associated status, without shifting',async()=>{
  const l=await lab();
  await l.set(1,'');await l.save();await l.open();
  expect(l.input(1).value).toBe('');
  expect(l.getRow(1)[field+':status']).toBe('');
  expect(l.getRow(1)['company-b']).toBe('Untouched B');
  expect(l.input(2).value).toBe('Replace');
});

it('mobile long press confirms then shifts the chosen name and status together, while preserving other columns and rows',async()=>{
  const l=await lab();
  vi.useFakeTimers();
  await act(async()=>{l.press(2,'pointerdown');await vi.advanceTimersByTimeAsync(600);});
  expect(l.menu()?.textContent).toContain('שורה 2');
  await act(async()=>{l.press(2,'pointerup');});
  vi.useRealTimers();
  await l.click(l.button('מחיקת שם וקידום הטור'));
  expect(l.input(2).value).toBe('Original');
  expect(l.input(3).value).toBe('');
  expect(l.requestVersions).toEqual([]);
  await l.save();await l.open();
  expect(l.getRow(1)[field]).toBe('Old');
  expect(l.getRow(2)).toMatchObject({[field]:'Original',[field+':status']:'v','company-b':'Second B'});
  expect(l.getRow(3)[field+':status']).toBeUndefined();
  expect(JSON.parse(l.entry.body).rows).toHaveLength(50);
});

it('ordinary tap and scroll gesture do not open cell actions',async()=>{
  const l=await lab();
  vi.useFakeTimers();
  await act(async()=>{
    l.press(1,'pointerdown');l.press(1,'pointerup');await vi.advanceTimersByTimeAsync(550);
  });
  expect(l.menu()).toBeNull();
  await act(async()=>{
    l.press(1,'pointerdown');l.press(1,'pointermove',10);await vi.advanceTimersByTimeAsync(550);
  });
  expect(l.menu()).toBeNull();
  await act(async()=>{
    l.press(1,'pointerdown');l.press(1,'pointercancel');await vi.advanceTimersByTimeAsync(550);
  });
  expect(l.menu()).toBeNull();
});

it('supports accessible menu, cancel, and undo before saving, preserving the prior draft',async()=>{
  const l=await lab();
  await l.set(3,'Preexisting draft');
  await l.cellMenu(1);
  expect(l.menu()).not.toBeNull();
  await l.click(l.button('ביטול'));
  expect(l.input(1).value).toBe('Old');
  await l.cellMenu(1);
  await l.click(l.button('מחיקת שם וקידום הטור'));
  await l.click(l.button('ביטול המחיקה והקידום'));
  expect([l.input(1).value,l.input(2).value,l.input(3).value]).toEqual(['Old','Replace','Preexisting draft']);
  // Undo removes the shifted-range guard as well as restoring the values.
  l.differentEditorWrites({2:'Other editor'});
  await l.save();
  expect(l.requestVersions).toEqual([1,2]);
  expect(l.persisted(2)).toBe('Other editor');
  expect(l.persisted(3)).toBe('Preexisting draft');
});

it('viewer cannot edit a cell or open its deletion action',async()=>{
  const l=await lab('viewer');
  expect(l.input(1).disabled).toBe(true);
  expect(document.querySelector('button[aria-label^="פעולות שם"]')).toBeNull();
  vi.useFakeTimers();
  await act(async()=>{l.press(1,'pointerdown');await vi.advanceTimersByTimeAsync(550);});
  expect(l.menu()).toBeNull();expect(l.requestVersions).toEqual([]);
});

it('merges an external edit to a different column or above the shift boundary',async()=>{
  const l=await lab();
  await l.cellMenu(2);await l.click(l.button('מחיקת שם וקידום הטור'));
  l.differentEditorWrites({1:'Above the shift'});
  const s=JSON.parse(l.entry.body);s.rows[1]['company-b']='Concurrent B';l.entry.body=JSON.stringify(s);
  await l.save();await l.open();
  expect(l.requestVersions).toEqual([1,2]);
  expect(l.getRow(1)[field]).toBe('Above the shift');
  expect(l.getRow(2)).toMatchObject({[field]:'Original',[field+':status']:'v','company-b':'Concurrent B'});
});

it('rejects editing even a locally unchanged duplicate mark in the shifted range, preserving both drafts',async()=>{
  const l=await lab();
  const same=JSON.parse(l.entry.body);same.rows[1][field]='Original';same.rows[1][field+':status']='v';l.entry.body=JSON.stringify(same);await l.open();
  await l.cellMenu(1);await l.click(l.button('מחיקת שם וקידום הטור'));
  const changed=JSON.parse(l.entry.body);changed.rows[1][field+':status']='x';l.entry.body=JSON.stringify(changed);l.entry.version++;
  await l.save();
  expect(l.requestVersions).toEqual([1]);
  expect(l.alert()).toContain('שורה 2');
  expect(l.getRow(1)[field]).toBe('Old');
  expect(l.getRow(2)[field+':status']).toBe('x');
  expect(l.input(1).value).toBe('Original');
});

it('the last row may be removed without shrinking a tracker with additional rows',async()=>{
  const l=await lab();
  const s=JSON.parse(l.entry.body);
  s.rows=Array.from({length:52},(_,i)=>s.rows[i]||{});
  s.rows[51]={[field]:'The last name',[field+':status']:'x','company-b':'Preserve this'};
  l.entry.body=JSON.stringify(s);await l.open();
  await l.cellMenu(52);await l.click(l.button('מחיקת שם וקידום הטור'));await l.save();await l.open();
  expect(l.input(52).value).toBe('');
  expect(l.getRow(52)).toEqual({'company-b':'Preserve this'});
  expect(JSON.parse(l.entry.body).rows).toHaveLength(52);
});
