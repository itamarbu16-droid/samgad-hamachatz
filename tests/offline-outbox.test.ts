import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { apiFetch, offlineStatus, syncPending } from '../src/lib/offline';
const workspace={user:{id:'first',name:'First'},tasks:[],decisions:[]};
let online=true;
let storage:Map<string,string>;
beforeEach(()=>{
 storage=new Map(); online=true;
 vi.stubGlobal('indexedDB',new IDBFactory());
 vi.stubGlobal('window',new EventTarget());
 vi.stubGlobal('navigator',{get onLine(){return online;}});
 vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(workspace)));
});
afterEach(()=>vi.unstubAllGlobals());
it('persists offline creation across module reload and synchronizes exactly one queued request',async()=>{
 await apiFetch('/api/workspace'); online=false;
 const response=await apiFetch('/api/tasks',{method:'POST',body:JSON.stringify({title:'Durable task'})});
 expect(response.headers.get('X-Samgad-Queued')).toBe('1');
 vi.resetModules();const reopened=await import('../src/lib/offline');
 expect(await reopened.offlineStatus()).toHaveLength(1);
 expect((await (await reopened.apiFetch('/api/workspace')).json()).tasks[0].title).toBe('Durable task');
 online=true;const post=vi.fn();vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{if(init?.method==='POST') {post();return Response.json({task:{id:'real'}});}return Response.json(workspace);}));
 await reopened.syncPending();await reopened.syncPending();
 expect(post).toHaveBeenCalledTimes(1);expect(await reopened.offlineStatus()).toHaveLength(0);
});
it('retains a version conflict without changing the submitted version or overwriting server data',async()=>{
 await apiFetch('/api/workspace');online=false;
 await apiFetch('/api/tasks/existing',{method:'PATCH',body:JSON.stringify({version:1,status:'completed'})});
 online=true;const writes:unknown[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='PATCH'){writes.push(JSON.parse(String(init.body)));return Response.json({error:'stale'},{status:409});}return Response.json(workspace);
 }));
 await syncPending();const queue=await offlineStatus();expect(queue).toHaveLength(1);expect(queue[0].error).toContain('המשימה השתנתה');expect(writes[0]).toMatchObject({version:1});
});
it('never replays a previous account’s pending writes through another account session',async()=>{
 await apiFetch('/api/workspace');online=false;
 await apiFetch('/api/tasks',{method:'POST',body:JSON.stringify({title:'Private first account'})});
 online=true;const calls=vi.fn(async()=>Response.json({...workspace,user:{id:'second'}}));vi.stubGlobal('fetch',calls);
 await syncPending();expect(calls).toHaveBeenCalledTimes(1);expect((await offlineStatus())[0].error).toContain('חשבון אחר');
 await apiFetch('/api/workspace');expect(await offlineStatus()).toHaveLength(0);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(workspace)));await apiFetch('/api/workspace');expect(await offlineStatus()).toHaveLength(1);
});
it('does not hide an actual authentication rejection behind cached data',async()=>{
 await apiFetch('/api/workspace');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'login'},{status:401})));
 expect((await apiFetch('/api/workspace')).status).toBe(401);
});
it('resolves a newly created local task before replaying its offline completion',async()=>{
 await apiFetch('/api/workspace');online=false;
 await apiFetch('/api/tasks',{method:'POST',body:JSON.stringify({title:'Create then complete'})});
 const [created]=await offlineStatus();
 await apiFetch(`/api/tasks/local-${created.id}`,{method:'PATCH',body:JSON.stringify({version:1,status:'completed'})});
 expect(await offlineStatus()).toHaveLength(2);
 online=true;const targets:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==='POST')return Response.json({task:{id:'real-task'}});
  if(init?.method==='PATCH'){targets.push(url);return Response.json({task:{id:'real-task',version:2}});}return Response.json(workspace);
 }));
 await syncPending();expect(targets).toEqual(['/api/tasks/real-task']);expect(await offlineStatus()).toHaveLength(0);
});
