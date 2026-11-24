// @vitest-environment happy-dom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {disableManualDevice,enableManualDevice,getManualDeviceState,manualDeviceCapability} from '../src/lib/manual-device-client';

afterEach(()=>vi.unstubAllGlobals());
const account=JSON.stringify(['org','user']);
const config={version:1,publicKey:null,context:'opaque',account:{organizationId:'org',userId:'user'}};
const signal=()=>new AbortController().signal;

describe('manual alert enrollment',()=>{
 it('only checks authenticated configuration before prompting an uninstalled iPhone',async()=>{
  const getRegistration=vi.fn();
  const requestPermission=vi.fn();
  vi.stubGlobal('navigator',{userAgent:'iPhone',serviceWorker:{getRegistration}});
  vi.stubGlobal('Notification',{permission:'default',requestPermission});
  const fetcher=vi.fn(async()=>Response.json(config));
  vi.stubGlobal('fetch',fetcher);
  expect(manualDeviceCapability()).toBe('install');
  expect(await getManualDeviceState(account,signal())).toMatchObject({state:'install'});
  expect(fetcher).toHaveBeenCalledWith('/api/push/manual-device',expect.objectContaining({method:'GET'}));
  expect(getRegistration).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
 });

 it('never asks denied users again or creates a registration without consent',async()=>{
  const register=vi.fn(),requestPermission=vi.fn();
  vi.stubGlobal('navigator',{userAgent:'synthetic-browser',serviceWorker:{register}});
  vi.stubGlobal('PushManager',class {});
  vi.stubGlobal('Notification',{permission:'denied',requestPermission});
  await expect(enableManualDevice('opaque',signal())).rejects.toThrow('המכשיר עדיין לא מוכן');
  expect(register).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
 });

 it('refuses to touch a foreign worker installed at the dedicated scope',async()=>{
  const register=vi.fn(),subscribe=vi.fn();
  vi.stubGlobal('navigator',{userAgent:'synthetic-browser',serviceWorker:{register,getRegistration:vi.fn(async()=>({
   scope:new URL('/manual-alerts-v1/',location.origin).href,
   active:{scriptURL:new URL('/sw.js',location.origin).href,state:'activated'},pushManager:{subscribe}
  }))}});
  vi.stubGlobal('PushManager',class {});
  vi.stubGlobal('Notification',{permission:'granted'});
  const fetcher=vi.fn();
  vi.stubGlobal('fetch',fetcher);
  await expect(enableManualDevice('opaque',signal())).rejects.toThrow('רכיב ההתראות אינו תואם');
  expect(register).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
 });
});

it('explicitly asks for permission, verifies the dedicated protocol and enrolls only its endpoint',async()=>{
 const key=Uint8Array.from([4,...Array(64).fill(23)]);
 const publicKey=Buffer.from(key).toString('base64url');
 const endpoint='https://synthetic.invalid/push/fresh';
 const requestPermission=vi.fn(async()=> 'granted');
 const subscribe=vi.fn(async()=>({endpoint,options:{applicationServerKey:key.buffer}}));
 const postMessage=vi.fn((_request:unknown,ports:Array<{reply:(data:unknown)=>void}>)=>ports[0].reply({version:1}));
 const registration={scope:new URL('/manual-alerts-v1/',location.origin).href,
  active:{state:'activated',scriptURL:new URL('/manual-alerts-v1/sw.js',location.origin).href,postMessage},
  pushManager:{getSubscription:vi.fn(async()=>null),subscribe}
 };
 const register=vi.fn(async()=>registration);
 vi.stubGlobal('navigator',{userAgent:'synthetic-browser',serviceWorker:{register,getRegistration:vi.fn(async()=>undefined)}});
 vi.stubGlobal('PushManager',class {});
 vi.stubGlobal('Notification',{permission:'default',requestPermission});
 vi.stubGlobal('MessageChannel',class {
  port1={onmessage:null as null|((event:{data:unknown})=>void),close:vi.fn()};
  port2={reply:(data:unknown)=>this.port1.onmessage?.({data})};
 });
 const fetcher=vi.fn(async(_url:string,options:RequestInit)=>Response.json(options.method==='PATCH'?{registered:true}:{...config,publicKey}));
 vi.stubGlobal('fetch',fetcher);
 expect(await getManualDeviceState(account,signal())).toMatchObject({state:'ready',context:'opaque'});
 expect(requestPermission).not.toHaveBeenCalled();
 expect(register).not.toHaveBeenCalled();
 expect(await enableManualDevice('opaque',signal())).toBe('registered');
 expect(requestPermission).toHaveBeenCalledTimes(1);
 expect(register).toHaveBeenCalledWith('/manual-alerts-v1/sw.js',{scope:'/manual-alerts-v1/',updateViaCache:'none'});
 expect(postMessage).toHaveBeenCalledWith({type:'samgad-manual-alerts-protocol'},expect.any(Array));
 expect(subscribe).toHaveBeenCalledWith({userVisibleOnly:true,applicationServerKey:key});
 expect(fetcher.mock.calls.map(([,opt])=>opt.method)).toEqual(['GET','PUT','POST','PATCH']);
 for(const [,options] of fetcher.mock.calls.slice(1))expect(new Headers(options.headers).get('x-samgad-manual-device-context')).toBe('opaque');
 expect(fetcher.mock.calls[2][1].body).toBe(JSON.stringify({version:1,endpoint}));
});

it('does not continue an enrollment aborted during the permission interaction',async()=>{
 const controller=new AbortController();
 const register=vi.fn(),fetcher=vi.fn();
 vi.stubGlobal('navigator',{userAgent:'synthetic-browser',serviceWorker:{register}});
 vi.stubGlobal('PushManager',class {});
 vi.stubGlobal('Notification',{permission:'default',requestPermission:async()=>{
  controller.abort();
  return 'granted';
 }});
 vi.stubGlobal('fetch',fetcher);
 await expect(enableManualDevice('opaque',controller.signal)).rejects.toHaveProperty('name','AbortError');
 expect(register).not.toHaveBeenCalled();
 expect(fetcher).not.toHaveBeenCalled();
});

it('refuses a configuration for a different signed-in workspace',async()=>{
 const getRegistration=vi.fn(),requestPermission=vi.fn();
 vi.stubGlobal('navigator',{userAgent:'iPhone',serviceWorker:{getRegistration}});
 vi.stubGlobal('Notification',{permission:'default',requestPermission});
 const fetcher=vi.fn(async()=>Response.json(config));
 vi.stubGlobal('fetch',fetcher);
 await expect(getManualDeviceState(JSON.stringify(['different-org','user']),signal())).rejects.toThrow('החיבור לחשבון השתנה');
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(requestPermission).not.toHaveBeenCalled();
 expect(getRegistration).not.toHaveBeenCalled();
});
it('does not create a worker or continue enrollment after the server rejects a stale context',async()=>{
 const register=vi.fn();
 vi.stubGlobal('navigator',{userAgent:'synthetic-browser',serviceWorker:{register,getRegistration:vi.fn(async()=>undefined)}});
 vi.stubGlobal('PushManager',class {});
 vi.stubGlobal('Notification',{permission:'granted'});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, {status:409}));
 vi.stubGlobal('fetch',fetcher);
 await expect(enableManualDevice('stale',signal())).rejects.toThrow('החיבור לחשבון השתנה');
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0][1]?.method).toBe('PUT');
 expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-samgad-manual-device-context')).toBe('stale');
 expect(register).not.toHaveBeenCalled();
});

it('opts out only a verified dedicated subscription bound to the current account',async()=>{
 const key=Uint8Array.from([4,...Array(64).fill(23)]);
 const publicKey=Buffer.from(key).toString('base64url');
 const endpoint='https://synthetic.invalid/push/dedicated',unsubscribe=vi.fn();
 const registration={scope:new URL('/manual-alerts-v1/',location.origin).href,
  active:{state:'activated',scriptURL:new URL('/manual-alerts-v1/sw.js',location.origin).href,
   postMessage:(_request:unknown,ports:Array<{reply:(data:unknown)=>void}>)=>ports[0].reply({version:1})},
  pushManager:{getSubscription:async()=>({endpoint,options:{applicationServerKey:key.buffer},unsubscribe})}
 };
 vi.stubGlobal('navigator',{serviceWorker:{getRegistration:async()=>registration}});
 vi.stubGlobal('MessageChannel',class {
  port1={onmessage:null as null|((event:{data:unknown})=>void),close:vi.fn()};
  port2={reply:(data:unknown)=>this.port1.onmessage?.({data})};
 });
 let registered=false,conflict=false;
 const fetcher=vi.fn(async(_url:string,options:RequestInit)=>options.method==='PATCH'
  ?Response.json({registered})
  :conflict?Response.json({error:'ownership conflict'},{status:409}):Response.json({removed:true}));
 vi.stubGlobal('fetch',fetcher);
 await expect(disableManualDevice('opaque',publicKey,signal())).rejects.toThrow('אין הרשמה פעילה');
 expect(fetcher.mock.calls.map(([,options])=>options.method)).toEqual(['PATCH']);
 fetcher.mockClear();registered=true;
 await disableManualDevice('opaque',publicKey,signal());
 expect(fetcher.mock.calls.map(([,options])=>options.method)).toEqual(['PATCH','DELETE']);
 expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify({version:1,endpoint}));
 expect(new Headers(fetcher.mock.calls[1][1].headers).get('x-samgad-manual-device-context')).toBe('opaque');
 conflict=true;
 await expect(disableManualDevice('opaque',publicKey,signal())).rejects.toThrow('השתמשו בדפדפן אחר');
 expect(unsubscribe).not.toHaveBeenCalled();
});
