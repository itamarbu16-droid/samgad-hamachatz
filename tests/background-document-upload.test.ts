// @vitest-environment happy-dom
import {describe,expect,it,vi} from 'vitest';
import {BackgroundDocumentUpload} from '../src/lib/background-document-upload';
import {DOCUMENT_CHUNK_BYTES} from '../src/lib/document-folders';

const identity={userId:'synthetic-user',workspaceOwnerId:'synthetic-owner'};
const context={...identity,organizationId:'synthetic-org',sessionMarker:'synthetic-marker'};
const draft={title:'Synthetic document',body:'',folderId:'synthetic-subfolder',documentDate:null};
const destination='Library / Synthetic';
const file=(name='test.txt',size=1)=>new File([new Uint8Array(size)],name);
const reply=(value:unknown,status=200)=>Response.json(value,{status});
const contextPath='/api/documents/upload-context';
const uploadPath='/api/documents/uploads';
const chunkPath='/api/documents/uploads/chunks';
const commitPath='/api/documents';
type RequestCall={path:string;init?:RequestInit;body:Record<string,unknown>};
function harness(handle:(call:RequestCall)=>Response|Promise<Response>){
 const calls:RequestCall[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const call={path:String(input),init,body:JSON.parse(String(init?.body??'{}'))};
  calls.push(call);
  return handle(call);
 };
 const saved=vi.fn();
 const store=new BackgroundDocumentUpload(fetcher,saved);
 store.setIdentity(identity);
 return {store,calls,saved};
}
function deferred<T>(){
 let resolve!:(value:T)=>void;
 const promise=new Promise<T>(r=>{resolve=r;});
 return {promise,resolve};
}
const until=(assertion:()=>void)=>vi.waitFor(assertion,{interval:5,timeout:3000});
const counts=(calls:RequestCall[],path:string)=>calls.filter(c=>c.path===path);

describe('background document uploads',()=>{
 it('continues after the folder consumer leaves, reports actual acknowledged bytes per file, and waits for commit confirmation',async()=>{
  const firstChunk=deferred<Response>(),secondChunk=deferred<Response>(),lastFile=deferred<Response>(),commit=deferred<Response>();
  const {store,calls,saved}=harness(({path,body})=>{
   if(path===contextPath)return reply(context);
   if(path===uploadPath)return reply({received:[]});
   if(path===chunkPath){
    if(counts(calls,uploadPath).length===2)return lastFile.promise;
    return body.index===0?firstChunk.promise:secondChunk.promise;
   }
   return commit.promise;
  });
  const leaving=vi.fn(),unsubscribe=store.subscribe(leaving);
  store.start(draft,[file('first.txt',DOCUMENT_CHUNK_BYTES+5),file('second.txt',7)],destination);
  const clientRequestId=store.snapshot()?.id;
  expect(store.snapshot()).toMatchObject({phase:'uploading',destination,files:[{name:'first.txt',bytes:0},{name:'second.txt',bytes:0}]});
  expect(()=>store.start(draft,[file()],destination)).toThrow();
  unsubscribe();const renderedBeforeNavigation=leaving.mock.calls.length;
  await until(()=>expect(counts(calls,chunkPath)).toHaveLength(2));
  firstChunk.resolve(reply({received:0}));
  await until(()=>expect(store.snapshot()?.files.map(f=>f.bytes)).toEqual([DOCUMENT_CHUNK_BYTES,0]));
  expect(leaving).toHaveBeenCalledTimes(renderedBeforeNavigation);
  const returned=vi.fn(),unsubscribeReturn=store.subscribe(returned);
  secondChunk.resolve(reply({received:1}));
  await until(()=>expect(counts(calls,chunkPath)).toHaveLength(3));
  expect(store.snapshot()?.files.map(f=>f.bytes)).toEqual([DOCUMENT_CHUNK_BYTES+5,0]);
  lastFile.resolve(reply({received:0}));
  await until(()=>expect(store.snapshot()?.phase).toBe('committing'));
  expect(store.snapshot()?.files.map(f=>f.bytes)).toEqual([DOCUMENT_CHUNK_BYTES+5,7]);
  expect(store.snapshot()?.entryId).toBeUndefined();
  expect(saved).not.toHaveBeenCalled();
  expect(counts(calls,commitPath)[0].body).toMatchObject({clientRequestId,folderId:draft.folderId,attachments:counts(calls,uploadPath).map(c=>({uploadId:c.body.id}))});
  for(const {init} of calls.filter(c=>c.path!==contextPath)){
   expect(new Headers(init?.headers).get('x-document-user')).toBe(context.userId);
   expect(new Headers(init?.headers).get('x-document-organization')).toBe(context.organizationId);
   expect(new Headers(init?.headers).get('x-document-owner')).toBe(context.workspaceOwnerId);
   expect(new Headers(init?.headers).get('x-document-session')).toBe(context.sessionMarker);
  }
  commit.resolve(reply({entry:{id:'synthetic-entry'}}));
  await until(()=>expect(store.snapshot()).toMatchObject({phase:'saved',entryId:'synthetic-entry'}));
  expect(saved).toHaveBeenCalledTimes(1);
  expect(returned).toHaveBeenCalled();
  store.acknowledge('different-entry');
  expect(store.snapshot()?.entryId).toBe('synthetic-entry');
  store.acknowledge('synthetic-entry');
  expect(store.snapshot()).toBeNull();
  unsubscribeReturn();
 });

 it('retries a lost commit acknowledgment with the identical document body and does not reupload',async()=>{
  const {store,calls,saved}=harness(({path})=>{
   if(path===contextPath)return reply(context);
   if(path===uploadPath)return reply({received:[]});
   if(path===chunkPath)return reply({received:0});
   if(counts(calls,commitPath).length===1)throw new TypeError('Failed to fetch');
   return reply({entry:{id:'one-entry'}});
  });
  store.start(draft,[file()],destination);
  const clientRequestId=store.snapshot()?.id;
  await until(()=>expect(store.snapshot()?.phase).toBe('failed'));
  expect(saved).not.toHaveBeenCalled();
  store.retry();store.retry();
  await until(()=>expect(store.snapshot()?.phase).toBe('saved'));
  expect(counts(calls,uploadPath)).toHaveLength(1);
  expect(counts(calls,chunkPath)).toHaveLength(1);
  const requests=counts(calls,commitPath).map(c=>c.body);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[1].clientRequestId).toBe(clientRequestId);
  expect(saved).toHaveBeenCalledTimes(1);
 });

 it('resumes a failed transfer using the same upload ID and sends only missing chunks',async()=>{
  const {store,calls}=harness(({path,body})=>{
   if(path===contextPath)return reply(context);
   if(path===uploadPath)return reply({received:counts(calls,uploadPath).length===1?[]:[0]});
   if(path===chunkPath){
    if(body.index===1&&counts(calls,chunkPath).filter(c=>c.body.index===1).length===1)return reply({error:'synthetic interruption'},503);
    return reply({received:body.index});
   }
   return reply({entry:{id:'one-entry'}});
  });
  store.start(draft,[file('resume.txt',DOCUMENT_CHUNK_BYTES+5)],destination);
  await until(()=>expect(store.snapshot()?.phase).toBe('failed'));
  expect(store.snapshot()?.files[0].bytes).toBe(DOCUMENT_CHUNK_BYTES);
  expect(counts(calls,commitPath)).toHaveLength(0);
  store.retry();
  await until(()=>expect(store.snapshot()?.phase).toBe('saved'));
  const starts=counts(calls,uploadPath);
  expect(starts).toHaveLength(2);
  expect(starts[1].body.id).toBe(starts[0].body.id);
  expect(counts(calls,chunkPath).filter(c=>c.body.index===0)).toHaveLength(1);
  expect(counts(calls,chunkPath).filter(c=>c.body.index===1)).toHaveLength(2);
  expect(store.snapshot()?.files[0].bytes).toBe(DOCUMENT_CHUNK_BYTES+5);
 });

 it('keeps the first file at 100% after the second fails, resumes both IDs and safely retries a lost commit acknowledgment',async()=>{
  const {store,calls,saved}=harness(({path,body})=>{
   if(path===contextPath)return reply(context);
   if(path===uploadPath){
    const starts=counts(calls,uploadPath).filter(c=>c.body.filename===body.filename);
    return reply({received:body.filename==='a.txt'&&starts.length===2?[0]:[]});
   }
   if(path===chunkPath){
    const upload=counts(calls,uploadPath).find(c=>c.body.id===body.uploadId);
    if(upload?.body.filename==='b.txt'&&counts(calls,chunkPath).filter(c=>c.body.uploadId===body.uploadId).length===1)
     return reply({error:'synthetic file B interruption'},503);
    return reply({received:0});
   }
   if(counts(calls,commitPath).length===1)throw new TypeError('Failed to fetch');
   return reply({entry:{id:'one-entry'}});
  });
  store.start(draft,[file('a.txt',11),file('b.txt',17)],destination);
  const clientRequestId=store.snapshot()?.id;
  await until(()=>expect(store.snapshot()).toMatchObject({phase:'failed',files:[{name:'a.txt',bytes:11,size:11},{name:'b.txt',bytes:0,size:17}]}));
  expect(counts(calls,commitPath)).toHaveLength(0);
  store.retry();
  await until(()=>expect(store.snapshot()).toMatchObject({phase:'failed',files:[{bytes:11},{bytes:17}]}));
  const starts=counts(calls,uploadPath).map(c=>c.body.id);
  expect(starts).toHaveLength(4);
  expect(starts.slice(2)).toEqual(starts.slice(0,2));
  expect(counts(calls,chunkPath).map(c=>c.body.uploadId)).toEqual([starts[0],starts[1],starts[1]]);
  store.retry();
  await until(()=>expect(store.snapshot()).toMatchObject({phase:'saved',entryId:'one-entry'}));
  expect(counts(calls,uploadPath)).toHaveLength(4);
  expect(counts(calls,chunkPath)).toHaveLength(3);
  const commits=counts(calls,commitPath).map(c=>c.body);
  expect(commits).toHaveLength(2);
  expect(commits[0]).toMatchObject({clientRequestId,attachments:[{uploadId:starts[0]},{uploadId:starts[1]}]});
  expect(commits[1]).toEqual(commits[0]);
  expect(saved).toHaveBeenCalledTimes(1);
 });

 it('restages an expired transfer with the original upload and commit IDs after an authoritative 404',async()=>{
  const {store,calls}=harness(({path})=>{
   if(path===contextPath)return reply(context);
   if(path===uploadPath)return reply({received:[]});
   if(path===chunkPath)return reply({received:0});
   return counts(calls,commitPath).length===1?reply({error:'synthetic staging expiry'},404):reply({entry:{id:'one-entry'}});
  });
  store.start(draft,[file()],destination);
  await until(()=>expect(store.snapshot()?.phase).toBe('failed'));
  store.retry();
  await until(()=>expect(store.snapshot()?.phase).toBe('saved'));
  expect(counts(calls,uploadPath).map(c=>c.body.id)).toEqual(Array(2).fill(counts(calls,uploadPath)[0].body.id));
  expect(counts(calls,chunkPath)).toHaveLength(2);
  const commits=counts(calls,commitPath).map(c=>c.body);
  expect(commits).toHaveLength(2);
  expect(commits[1]).toEqual(commits[0]);
 });

 it.each(['logout','identity change'])('clears pending metadata and aborts in-flight work on %s',async(reason)=>{
  const chunk=deferred<Response>();
  const {store,calls,saved}=harness(({path})=>{
   if(path===contextPath)return reply(context);
   if(path===uploadPath)return reply({received:[]});
   return chunk.promise;
  });
  store.start(draft,[file()],destination);
  await until(()=>expect(counts(calls,chunkPath)).toHaveLength(1));
  if(reason==='logout')store.clear();
  else store.setIdentity({userId:'other-user',workspaceOwnerId:'other-owner'});
  expect(counts(calls,chunkPath)[0].init?.signal?.aborted).toBe(true);
  expect(store.snapshot()).toBeNull();
  chunk.resolve(reply({received:0}));
  await new Promise(resolve=>setTimeout(resolve,10));
  store.retry();
  expect(counts(calls,commitPath)).toHaveLength(0);
  expect(saved).not.toHaveBeenCalled();
  expect(store.snapshot()).toBeNull();
 });

 it('never starts sending file data when the current account differs from the workspace account',async()=>{
  const {store,calls}=harness(()=>reply({...context,userId:'other-user'}));
  store.start(draft,[file()],destination);
  await until(()=>expect(store.snapshot()).toBeNull());
  store.retry();
  expect(calls.map(c=>c.path)).toEqual([contextPath]);
 });

 it('discards retry after the session marker changes even when account and organization are unchanged',async()=>{
  const {store,calls}=harness(({path})=>{
   if(path===contextPath)return reply({...context,sessionMarker:counts(calls,contextPath).length===1?context.sessionMarker:'replacement-marker'});
   return reply({error:'synthetic interruption'},503);
  });
  store.start(draft,[file()],destination);
  await until(()=>expect(store.snapshot()?.phase).toBe('failed'));
  store.retry();
  await until(()=>expect(store.snapshot()).toBeNull());
  expect(calls.map(c=>c.path)).toEqual([contextPath,uploadPath,contextPath]);
 });

 it.each([401,403,409])('does not keep or retry a stale upload after authorization rejection (%i)',async(status)=>{
  const {store,calls}=harness(({path})=>{
   if(path===contextPath)return reply(context);
   if(path===uploadPath)return reply({received:[]});
   return reply({error:'synthetic rejection',...(status===409?{code:'DOCUMENT_UPLOAD_CONTEXT_CHANGED'}:{})},status);
  });
  store.start(draft,[file()],destination);
  await until(()=>expect(store.snapshot()).toBeNull());
  const requestCount=calls.length;
  expect(counts(calls,chunkPath)).toHaveLength(1);
  store.retry();
  expect(calls).toHaveLength(requestCount);
  expect(counts(calls,commitPath)).toHaveLength(0);
 });
});

it('uses the global fetch receiver instead of the upload store (browser brand check)',async()=>{
 const nativeLike=vi.fn(async function(this:unknown,input:RequestInfo|URL){
  if(this!==globalThis)throw new TypeError('Illegal invocation');
  return reply(String(input)===contextPath?context:{entry:{id:'synthetic-saved'}});
 });
 vi.stubGlobal('fetch',nativeLike);
 try{
  // Previous code saved native fetch as a property and invoked it on the store.
  const previous=new BackgroundDocumentUpload(globalThis.fetch);
  previous.setIdentity(identity);previous.start({...draft,body:'synthetic'},[],destination);
  await vi.waitFor(()=>expect(previous.snapshot()?.phase).toBe('failed'));
  expect(nativeLike.mock.contexts[0]).toBe(previous);
  nativeLike.mockClear();
  // Provider now selects this default wrapper, which preserves the global receiver.
  const fixed=new BackgroundDocumentUpload(undefined);
  fixed.setIdentity(identity);fixed.start({...draft,body:'synthetic'},[],destination);
  await vi.waitFor(()=>expect(fixed.snapshot()?.phase).toBe('saved'));
  expect(nativeLike).toHaveBeenCalledTimes(2);
  expect(nativeLike.mock.contexts.every(value=>value===globalThis)).toBe(true);
 }finally{vi.unstubAllGlobals();}
});
