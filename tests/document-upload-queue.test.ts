// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {BackgroundDocumentUpload} from '../src/lib/background-document-upload';

const context={userId:'user',workspaceOwnerId:'owner',organizationId:'org',sessionMarker:'marker'};
const check='/api/documents/upload-context', begin='/api/documents/uploads', chunk=begin+'/chunks', commit='/api/documents';
const reply=(value:unknown,status=200)=>Response.json(value,{status});
const defaultReply=(path:string,body:Record<string,unknown>)=>path===check?reply(context):path===begin?reply({received:[]}):path===chunk?reply({received:0}):reply({entry:{id:body.clientRequestId}});
const file=()=>new File(['synthetic'],'same.txt');
const draft=(folderId:string)=>({title:'Synthetic document',folderId,body:'Synthetic text',documentDate:null});
const until=(assertion:()=>void)=>vi.waitFor(assertion,{interval:5,timeout:3000});
function deferred(){
 let settle!:(value:Response)=>void;
 const promise=new Promise<Response>(resolve=>{settle=resolve;});
 return {promise,settle};
}
type Call={path:string;body:Record<string,unknown>;signal?:AbortSignal|null};
function harness(handle:(call:Call)=>Response|Promise<Response>){
 const calls:Call[]=[];
 const saved=vi.fn();
 const fetcher:typeof fetch=async(input,init)=>{
  const call={path:String(input),body:JSON.parse(String(init?.body??'{}')),signal:init?.signal};
  calls.push(call);return handle(call);
 };
 const store=new BackgroundDocumentUpload(fetcher,saved);store.setIdentity(context);
 const start=(id:string,files=[file()])=>store.start(draft(id),files,'Library / '+id);
 const get=(id:string)=>store.snapshots().find(job=>job.id===id);
 return {store,calls,start,get,saved};
}
afterEach(()=>vi.unstubAllGlobals());

it('keeps distinct jobs for the same filename, skips the failed first, and retries it behind jobs already queued',async()=>{
 const first=deferred(),second=deferred();
 const uploadIds:string[]=[];
 const {store,calls,start,get}=harness(({path,body})=>{
  if(path===begin)uploadIds.push(String(body.id));
  if(path===chunk&&uploadIds.length===1)return first.promise;
  if(path===chunk&&uploadIds.length===2)return second.promise;
  return defaultReply(path,body);
 });
 const a=start('A'),b=start('B'),c=start('C');
 expect(new Set([a,b,c]).size).toBe(3);
 expect(store.snapshots().map(job=>job.draft.folderId)).toEqual(['A','B','C']);
 expect(store.snapshots().slice(1).map(job=>job.phase)).toEqual(['queued','queued']);
 const snapshot=store.snapshots();expect(store.snapshots()).toBe(snapshot);
 await until(()=>expect(calls.filter(x=>x.path===chunk)).toHaveLength(1));
 first.settle(reply({error:'untrusted server details'},503));
 await until(()=>expect(calls.filter(x=>x.path===chunk)).toHaveLength(2));
 expect(get(a)).toMatchObject({phase:'failed',stage:'transferring'});
 expect(get(a)?.error).not.toContain('untrusted server details');
 expect(get(b)?.phase).toBe('uploading');
 store.retry(a);
 expect(get(a)?.phase).toBe('queued');
 second.settle(reply({received:0}));
 await until(()=>expect(store.snapshots().map(job=>job.phase)).toEqual(['saved','saved','saved']));
 expect(uploadIds.slice(0,3)).toHaveLength(3);expect(new Set(uploadIds.slice(0,3)).size).toBe(3);
 expect(uploadIds[3]).toBe(uploadIds[0]);
 expect(calls.filter(x=>x.path===commit).map(x=>[x.body.folderId,x.body.clientRequestId])).toEqual([['B',b],['C',c],['A',a]]);
 store.acknowledge(b);
 expect(store.snapshots().map(job=>job.id)).toEqual(expect.arrayContaining([a,c]));
 expect(get(b)).toBeUndefined();
});

it('removes only the selected job and drains a cancelled request before starting the next job',async()=>{
 const inFlight=deferred();
 let seenChunk=false;
 const {store,calls,start,get,saved}=harness(({path,body})=>{
  if(path===chunk&&!seenChunk){seenChunk=true;return inFlight.promise;}
  return defaultReply(path,body);
 });
 const a=start('A'),b=start('B'),c=start('C');
 await until(()=>expect(calls.filter(x=>x.path===chunk)).toHaveLength(1));
 store.remove(b);store.remove(a);
 expect(calls.find(x=>x.path===chunk)?.signal?.aborted).toBe(true);
 expect(get(a)).toBeUndefined();expect(get(b)).toBeUndefined();
 expect(get(c)?.phase).toBe('queued');
 expect(calls.filter(x=>x.path===check)).toHaveLength(1);
 inFlight.settle(reply({received:0}));
 await until(()=>expect(get(c)?.phase).toBe('saved'));
 expect(calls.filter(x=>x.path===commit).map(x=>x.body.folderId)).toEqual(['C']);
 expect(saved).toHaveBeenCalledTimes(1);
});

it('discards the whole queue on a changed session without transferring any queued files',async()=>{
 const active=deferred();
 const {store,calls,start}=harness(({path})=>path===check?reply(context):active.promise);
 start('A');start('B');start('C');
 await until(()=>expect(calls.filter(x=>x.path===begin)).toHaveLength(1));
 active.settle(reply({code:'DOCUMENT_UPLOAD_CONTEXT_CHANGED'},409));
 await until(()=>expect(store.snapshots()).toEqual([]));
 expect(calls.map(x=>x.path)).toEqual([check,begin]);
});

it('bounds the outstanding job count and total retained file bytes',()=>{
 const never=deferred();
 const {store,start}=harness(()=>never.promise);
 for(let i=0;i<5;i++)start(String(i),[]);
 expect(()=>start('Too many',[])).toThrow();
 expect(store.snapshots()).toHaveLength(5);
 store.clear();
 const next=harness(()=>deferred().promise);
 const large=()=>Object.defineProperty(file(),'size',{value:25*1024*1024});
 next.start('A',[large(),large(),large(),large()]);
 expect(()=>next.start('Too much')).toThrow();
 expect(next.store.snapshots()).toHaveLength(1);
 next.store.clear();never.settle(reply(context));
});

it('invokes the browser fetch with the global receiver rather than the upload store',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',async function(this:unknown,input:RequestInfo|URL,init?:RequestInit){
  if(this!==globalThis)throw TypeError('Illegal invocation');
  const path=String(input);calls.push(path);
  return defaultReply(path,JSON.parse(String(init?.body??'{}')));
 });
 const store=new BackgroundDocumentUpload();store.setIdentity(context);
 store.start(draft('A'),[file()],'A');
 await until(()=>expect(store.snapshots()[0]?.phase).toBe('saved'));
 expect(calls).toEqual([check,begin,chunk,commit]);
});

it.each([[check,'checking'],[begin,'preparing'],[chunk,'transferring'],[commit,'committing']] as const)(
 'reports the failed step at %s without blaming the network or exposing raw server errors',
 async(failedPath,stage)=>{
  const {start,get}=harness(({path,body})=>path===failedPath?reply({error:'private diagnostic'},503):defaultReply(path,body));
  const id=start('A');
  await until(()=>expect(get(id)).toMatchObject({phase:'failed',stage,error:expect.any(String)}));
  expect(get(id)?.error).not.toContain('private diagnostic');
 },
);

it('ignores a stale preflight body that resolves after changing workspace identity',async()=>{
 const gate=deferred();
 const nextContext={...context,userId:'other-user',organizationId:'other-org',sessionMarker:'other-marker'};
 let parsing=false,checks=0;
 const slow=new Response();
 slow.json=async()=>{parsing=true;return (await gate.promise).json();};
 const {store,start,get,calls}=harness(({path,body})=>{
  if(path===check)return ++checks===1?slow:reply(nextContext);
  return defaultReply(path,body);
 });
 const old=start('Old');
 await until(()=>expect(parsing).toBe(true));
 store.setIdentity(nextContext);
 const next=start('New');
 gate.settle(reply(context));
 await until(()=>expect(get(next)?.phase).toBe('saved'));
 expect(get(old)).toBeUndefined();
 expect(calls.filter(x=>x.path===commit).map(x=>x.body.folderId)).toEqual(['New']);
});

it.each(['remove','clear'] as const)('reserves an active job’s count and bytes until aborted requests settle after %s',async(action)=>{
 const inFlight=deferred();
 let began=false;
 const {store,start,get,calls}=harness(({path,body})=>{
  if(path===begin&&!began){began=true;return inFlight.promise;}
  return defaultReply(path,body);
 });
 const big=()=>Object.defineProperty(file(),'size',{value:25*1024*1024});
 const old=start('Old',[big(),big(),big(),big()]);
 await until(()=>expect(began).toBe(true));
 if(action==='remove')store.remove(old);
 else store.clear();
 expect(get(old)).toBeUndefined();
 expect(calls.find(call=>call.path===begin)?.signal?.aborted).toBe(true);
 expect(()=>start('Bytes')).toThrow(/100/);
 const others=Array.from({length:4},(_,i)=>start('Other '+i,[]));
 expect(()=>start('Count',[])).toThrow(/5/);
 inFlight.settle(reply({received:[]}));
 await until(()=>expect(others.every(id=>get(id)?.phase==='saved')).toBe(true));
 const next=start('New');
 await until(()=>expect(get(next)?.phase).toBe('saved'));
 expect(calls.filter(call=>call.path===commit).map(call=>call.body.folderId)).not.toContain('Old');
});

it('does not present late removal as cancellation once final save has begun',async()=>{
 const saving=deferred();
 const {store,start,get,calls}=harness(({path,body})=>path===commit?saving.promise:defaultReply(path,body));
 const id=start('A');
 await until(()=>expect(get(id)?.phase).toBe('committing'));
 store.remove(id);
 expect(get(id)?.phase).toBe('committing');
 expect(calls.find(call=>call.path===commit)?.signal?.aborted).toBe(false);
 saving.settle(reply({entry:{id:'saved-A'}}));
 await until(()=>expect(get(id)?.phase).toBe('saved'));
});

it('rejects changed org on the first preflight even with the same user, owner and session',async()=>{
 const {store,start,calls}=harness(({path,body})=>path===check?reply({...context,organizationId:'other-org'}):defaultReply(path,body));
 start('A');start('B');
 await until(()=>expect(store.snapshots()).toEqual([]));
 expect(calls.map(call=>call.path)).toEqual([check]);
});

it.each([undefined,'','   '])('fails closed before network with missing org in an old offline workspace snapshot (%s)',org=>{
 const fetcher=vi.fn<typeof fetch>();
 const store=new BackgroundDocumentUpload(fetcher);
 store.setIdentity({...context,organizationId:org as unknown as string});
 expect(()=>store.start(draft('A'),[file()],'Library / A')).toThrow();
 expect(store.snapshots()).toEqual([]);expect(fetcher).not.toHaveBeenCalled();
});
