// @vitest-environment happy-dom
import React,{act,createElement as h,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {DocumentUploadProvider,DocumentUploadStatus,useDocumentUpload} from '../src/components/document-upload-provider';
import DocumentLibrary from "../src/components/document-library";
import {documentFolders} from "../src/lib/document-folders";
vi.mock("../src/lib/offline",()=>({apiFetch:(...args:Parameters<typeof fetch>)=>fetch(...args)}));
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});

it('keeps the same upload while switching screens and aborts on provider teardown',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 let finish!: (response:Response)=>void;
 const delayed=new Promise<Response>(resolve=>{finish=resolve;});
 const firstFilePosted=vi.fn();
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async function(this:unknown,input,init){
  expect(this).toBe(globalThis);
  switch(String(input)){
   case '/api/documents/upload-context':return Response.json({userId:'a',organizationId:'org',workspaceOwnerId:'owner',sessionMarker:'marker'});
   case '/api/documents/uploads':return Response.json({received:[]});
   case '/api/documents/uploads/chunks':firstFilePosted(init?.signal);return delayed;
   default:return Response.json({entry:{id:'saved-document'}});
  }
 });
 const storeSeen=vi.fn();
 function Folder(){
  const {store,pendingDocuments}=useDocumentUpload();
  storeSeen(store);
  return h('div',null,h('output',null,pendingDocuments[0]?.phase??'empty'),h('button',{onClick:()=>{
   store.setIdentity({userId:'a',workspaceOwnerId:'owner',organizationId:'org'});
   store.start({title:'Synthetic',body:'',folderId:'synthetic-folder',documentDate:null},[new File(['a'],'synthetic.txt')],'Synthetic folder');
  }},'start'));
 }
 function OtherScreen(){return h('h1',null,'Another screen');}
 const render=(folder:boolean)=>root.render(h(DocumentUploadProvider,null,h(DocumentUploadStatus),folder?h(Folder):h(OtherScreen)));
 try{
  await act(async()=>render(true));
  const initialStore=storeSeen.mock.calls[0][0];
  await act(async()=>host.querySelector('button')!.click());
  await act(async()=>vi.waitFor(()=>expect(firstFilePosted).toHaveBeenCalledTimes(1)));
  expect(host.querySelector('output')?.textContent).toBe('uploading');
  await act(async()=>render(false));
  expect(host.querySelector('h1')?.textContent).toBe('Another screen');
  expect(host.textContent).toContain('Synthetic folder');
  expect(firstFilePosted.mock.calls[0][0].aborted).toBe(false);
  await act(async()=>render(true));
  expect(storeSeen.mock.calls.at(-1)?.[0]).toBe(initialStore);
  expect(host.querySelector('output')?.textContent).toBe('uploading');
  await act(async()=>root.render(null));
  expect(firstFilePosted.mock.calls[0][0].aborted).toBe(true);
  await act(async()=>finish(Response.json({received:0})));
  expect(fetcher.mock.calls.some(([input])=>String(input)==='/api/documents')).toBe(false);
 }finally{
  await act(async()=>root.unmount());
  fetcher.mockRestore();
  host.remove();
 }
});

it('closes the document form before upload and replaces the destination placeholder only after acknowledgment',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 function deferred(){let resolve!:(response:Response)=>void;const promise=new Promise<Response>(r=>{resolve=r;});return {promise,resolve};}
 const context=deferred(),chunk=deferred(),commit=deferred();
 const requests:string[]=[];
 const folders=[...documentFolders,{id:'custom-child',name:'תיקיית בדיקה',parent:'formats',section:'library'}];
 const title='מסמך סינתטי להעלאה',filename='synthetic.txt';
 const result={id:'created-entry',title,folderId:'custom-child',preview:'',creatorId:'a',documentDate:null,version:1,attachments:[],updatedAt:'2026-01-01T00:00:00Z'};
 let entries:typeof result[]=[];
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const route=`${init?.method??'GET'} ${String(input)}`;requests.push(route);
  switch(route){
   case 'GET /api/documents':return Response.json({entries,folders});
   case 'GET /api/documents/upload-context':return context.promise;
   case 'POST /api/documents/uploads':return Response.json({received:[]});
   case 'POST /api/documents/uploads/chunks':return chunk.promise;
   case 'POST /api/documents':return commit.promise;
   default:throw Error(`Unexpected synthetic request: ${route}`);
  }
 });
 function Identity(){
  const {store}=useDocumentUpload();
  useEffect(()=>{store.setIdentity({userId:'a',workspaceOwnerId:'owner',organizationId:'org'});},[store]);
  return null;
 }
 const pendingRow=()=>host.querySelector('[aria-label="מסמך בהעלאה"]');
 const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!;
 const requestSeen=(route:string)=>act(async()=>vi.waitFor(()=>expect(requests).toContain(route)));
 try{
  await act(async()=>root.render(h(DocumentUploadProvider,null,h(Identity),h(DocumentLibrary,{section:'library',userId:'a',role:'deputy'}))));
  await requestSeen('GET /api/documents');
  await act(async()=>button('הוספת מסמך / קובץ').click());
  const dialog=document.querySelector('[role=dialog]')!;
  dialog.querySelector<HTMLInputElement>('[name=title]')!.value=title;
  dialog.querySelector<HTMLSelectElement>('[name=folderId]')!.value='custom-child';
  const input=dialog.querySelector<HTMLInputElement>('[type=file]')!;
  Object.defineProperty(input,'files',{value:[new File(['abc'],filename)]});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  await act(async()=>button('שמירה בתיקייה').click());
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(pendingRow()?.textContent).toContain(title);
  expect(pendingRow()?.textContent).toContain('פורמטים / תיקיית בדיקה');
  expect(pendingRow()?.textContent).toContain(`${filename} · 0%`);
  expect(host.querySelector('.document-entry-shell')).toBeNull();
  await act(async()=>context.resolve(Response.json({userId:'a',workspaceOwnerId:'owner',organizationId:'org',sessionMarker:'marker'})));
  await requestSeen('POST /api/documents/uploads/chunks');
  await act(async()=>chunk.resolve(Response.json({received:0})));
  await requestSeen('POST /api/documents');
  expect(pendingRow()?.textContent).toContain(`${filename} · 100%`);
  expect(pendingRow()?.textContent).toContain('ממתין לאישור שמירת המסמך');
  expect(host.querySelector('.document-entry-shell')).toBeNull();
  entries=[result];
  await act(async()=>commit.resolve(Response.json({entry:{id:result.id}})));
  expect(pendingRow()).toBeNull();
  expect(host.querySelector('.document-entry-shell')?.textContent).toContain(title);
 }finally{
  await act(async()=>root.unmount());
  fetcher.mockRestore();
  host.remove();
 }
});

it('shows same-title jobs separately across folders and stops only the selected upload',async()=>{
 const host=document.createElement('div');document.body.append(host);
 const root=createRoot(host);
 const title='מסמך בדיקה זהה';
 const folders=[...documentFolders,{id:'folder-a',name:'תיקייה סינתטית א',parent:null,section:'library'},{id:'folder-b',name:'תיקייה סינתטית ב',parent:null,section:'library'}];
 const firstChunk=vi.fn(),commitFolders:string[]=[];
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  switch(String(input)){
   case '/api/documents/upload-context':return Response.json({userId:'a',organizationId:'org',workspaceOwnerId:'owner',sessionMarker:'marker'});
   case '/api/documents/uploads':return Response.json({received:[]});
   case '/api/documents/uploads/chunks': {
    if(firstChunk.mock.calls.length)return Response.json({received:0});
    firstChunk(init?.signal);
    return new Promise<Response>((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
   }
   case '/api/documents':
    if(init?.method==='POST'){commitFolders.push(JSON.parse(String(init.body)).folderId);return Response.json({entry:{id:'saved-b'}});}
    return Response.json({entries:[],folders});
   default:throw Error('Unexpected synthetic request');
  }
 });
 function Seed(){
  const {store}=useDocumentUpload();
  return h('button',{onClick:()=>{
    store.setIdentity({userId:'a',workspaceOwnerId:'owner',organizationId:'org'});
    for(const [suffix,name] of [['a','תיקייה סינתטית א'],['b','תיקייה סינתטית ב']]){
     store.start({title,body:'',folderId:'folder-'+suffix,documentDate:null},[new File(['abc'],suffix+'.txt')],name);
    }
  }},'seed');
 }
 const globalQueue=()=>host.querySelector('[aria-label="תור העלאות מסמכים"]')!;
 const localCard=()=>host.querySelector('[aria-label="מסמך בהעלאה"]');
 const clickFolder=async(name:string)=>{
  const button=Array.from(host.querySelectorAll('button')).find(b=>b.querySelector('strong')?.textContent===name);
  await act(async()=>button!.click());
 };
 try{
  await act(async()=>root.render(h(DocumentUploadProvider,null,h(Seed),h(DocumentUploadStatus),h(DocumentLibrary,{section:'library',userId:'a',role:'deputy'}))));
  await act(async()=>host.querySelector('button')!.click());
  await act(async()=>vi.waitFor(()=>expect(firstChunk).toHaveBeenCalledTimes(1)));
  expect(globalQueue().querySelectorAll('li')).toHaveLength(2);
  expect(globalQueue().textContent).toContain('אחד ממתין');
  await clickFolder('תיקייה סינתטית א');
  expect(localCard()?.textContent).toContain('a.txt · 0%');
  await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()==='חזרה')!.click());
  await clickFolder('תיקייה סינתטית ב');
  expect(localCard()?.textContent).toContain('b.txt · 0%');
  expect(localCard()?.textContent).toContain('ממתין בתור');
  await act(async()=>globalQueue().querySelector<HTMLButtonElement>('button[aria-label$="תיקייה סינתטית א"]')!.click());
  await act(async()=>vi.waitFor(()=>expect(commitFolders).toEqual(['folder-b'])));
  expect(firstChunk.mock.calls[0][0].aborted).toBe(true);
  expect(globalQueue().querySelectorAll('li')).toHaveLength(1);
  expect(fetcher.mock.calls.some(([,init])=>init?.method==='DELETE')).toBe(false);
 }finally{
  await act(async()=>root.unmount());fetcher.mockRestore();host.remove();
 }
});
