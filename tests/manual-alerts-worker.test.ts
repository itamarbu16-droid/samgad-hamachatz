import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';

const code=readFileSync(new URL('../public/manual-alerts-v1/sw.js',import.meta.url),'utf8');
const endpoint='https://web.push.apple.com/synthetic-device';
type EventHandler=(event:Record<string,unknown>)=>void;

function worker(fetcher=vi.fn(async()=>Response.json({show:true})),sub:{endpoint:string}|null={endpoint}){
 const events=new Map<string,EventHandler>();
 const show=vi.fn(async()=>{}),open=vi.fn(async()=>{}),skip=vi.fn(async()=>{}),claim=vi.fn(async()=>{});
 runInNewContext(code,{URL,fetch:fetcher,self:{location:{origin:'https://fixture.test'},addEventListener:(key:string,handler:EventHandler)=>events.set(key,handler),skipWaiting:skip,clients:{openWindow:open,claim},registration:{pushManager:{getSubscription:async()=>sub},showNotification:show}}});
 function dispatch(type:string,arg={}):Promise<unknown>{
  let waiting=Promise.resolve();events.get(type)?.({...arg,waitUntil:(value:Promise<void>)=>{waiting=value;}});return waiting;
 }
 return {events,dispatch,fetcher,show,open,skip,claim};
}

it('uses exactly its own endpoint/check and displays generic text only',async()=>{
 const w=worker();await w.dispatch('push',{data:{json:()=>{throw Error('must not use push payload');}}});
 expect(w.fetcher).toHaveBeenCalledExactlyOnceWith('/api/push/manual-device/check',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,endpoint})});
 expect(w.show).toHaveBeenCalledExactlyOnceWith('תזכורת אישית',{body:'משימה שלך ממתינה באפליקציה.',tag:'samgad-manual-reminder'});
 expect(w.events.has('fetch')).toBe(false);expect(w.events.has('activate')).toBe(false);
});

it.each([
 ()=>Response.json({show:false}),()=>new Response(null,{status:404}),
 ()=>new Response(null,{status:401}),()=>new Response('malformed'),
 ()=>Response.json({show:'true'}),()=>{throw Error('offline');}
])('never shows a notification or calls another queue when check is not positive',async reply=>{
 const fetcher=vi.fn(async()=>reply());const w=worker(fetcher);await w.dispatch('push');
 expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/push/manual-device/check',expect.any(Object));
 expect(w.show).not.toHaveBeenCalled();
});

it('fails closed without a subscription and never claims ordinary clients',async()=>{
 const w=worker(undefined,null);await w.dispatch('install');await w.dispatch('activate');await w.dispatch('push');
 expect(w.skip).toHaveBeenCalledOnce();expect(w.claim).not.toHaveBeenCalled();expect(w.fetcher).not.toHaveBeenCalled();expect(w.show).not.toHaveBeenCalled();
});

it('answers the protocol handshake and opens only the generic root',async()=>{
 const w=worker();const postMessage=vi.fn(),close=vi.fn();
 await w.dispatch('message',{data:{type:'ordinary'},ports:[{postMessage}]});expect(postMessage).not.toHaveBeenCalled();
 await w.dispatch('message',{data:{type:'samgad-manual-alerts-protocol'},ports:[{postMessage}]});expect(postMessage).toHaveBeenCalledExactlyOnceWith({version:1});
 await w.dispatch('notificationclick',{notification:{close,data:{url:'https://unexpected.test/task'}}});
 expect(close).toHaveBeenCalledOnce();expect(w.open).toHaveBeenCalledExactlyOnceWith('https://fixture.test/');
});
