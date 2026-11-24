// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import ManualReminderNotice from '../src/components/manual-reminder-notice';

Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
const endpoint='/api/push/task-reminder',url='/?view=tasks&task=fixture';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();history.replaceState({},'','/');});

it('shows authenticated in-app fallback and clears it only after successful acknowledgement',async()=>{
 let acknowledged=false;
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async (path,init)=>{
  expect(path).toBe(endpoint);
  if(init?.method==='PATCH'){
   expect(JSON.parse(String(init.body))).toEqual({id:'fixture-reminder'});
   acknowledged=true;return Response.json({ok:true});
  }
  return Response.json(acknowledged?[]:[{id:'fixture-reminder',url}]);
 });
 await act(async()=>root.render(<ManualReminderNotice/>));
 expect(host.querySelector('a')?.getAttribute('href')).toBe(url);
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PATCH')).toHaveLength(0);
 await act(async()=>host.querySelector<HTMLButtonElement>('button')?.click());
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PATCH')).toHaveLength(1);
 expect(host.querySelector('aside')).toBeNull();
});

it('fails closed on Chrome offline-auth revalidation and refuses external links',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
  .mockResolvedValueOnce(Response.json([{id:'bad',url:'https://example.invalid/'}]))
  .mockResolvedValueOnce(Response.json([{id:'valid',url}]))
  .mockResolvedValueOnce(new Response(null,{status:403}));
 await act(async()=>root.render(<ManualReminderNotice/>));
 expect(host.querySelector('aside')).toBeNull();
 await act(async()=>{window.dispatchEvent(new Event('samgad:manual-reminder-seen'));});
 expect(host.querySelector('a')?.getAttribute('href')).toBe(url);
 await act(async()=>{window.dispatchEvent(new Event('samgad:manual-reminder-seen'));});
 expect(host.querySelector('aside')).toBeNull();
 expect(fetcher).toHaveBeenCalledTimes(3);
});
