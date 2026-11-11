import {afterEach,it,expect,vi} from 'vitest';
import {syncDevicePush} from '../src/lib/device-push';
afterEach(()=>vi.unstubAllGlobals());
function setup(permission:NotificationPermission,existing=true){
 const subscription={toJSON:()=>({endpoint:'https://web.push.apple.com/example',keys:{p256dh:'key',auth:'auth'}})};
 const requestPermission=vi.fn(async()=> 'granted');
 const subscribe=vi.fn(async()=>subscription),getSubscription=vi.fn(async()=>existing?subscription:null);
 const register=vi.fn(async()=>({}));
 vi.stubGlobal('window',{PushManager:{},Notification:{}});
 vi.stubGlobal('Notification',{permission,requestPermission});
 vi.stubGlobal('navigator',{serviceWorker:{register,ready:Promise.resolve({pushManager:{getSubscription,subscribe}})}});
 const fetch=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?Response.json({ok:true}):Response.json({publicKey:'BElzb2xhdGVkLXRlc3Q'}));vi.stubGlobal('fetch',fetch);
 return {subscription,requestPermission,subscribe,getSubscription,register,fetch};
}
it('restores an existing subscription after relaunch without asking permission or resubscribing',async()=>{
 const api=setup('granted');
 expect(await syncDevicePush()).toBe(true);expect(await syncDevicePush()).toBe(true);
 expect(api.requestPermission).not.toHaveBeenCalled();expect(api.subscribe).not.toHaveBeenCalled();
 expect(api.fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(2);
 expect(JSON.parse(String(api.fetch.mock.calls[1][1]?.body))).toEqual(api.subscription.toJSON());
});
it('does not request browser permission on automatic startup',async()=>{
 const api=setup('default');expect(await syncDevicePush()).toBe(false);
 expect(api.requestPermission).not.toHaveBeenCalled();expect(api.fetch).not.toHaveBeenCalled();expect(api.subscribe).not.toHaveBeenCalled();
});
it('requests permission only from explicit activation and recreates missing subscriptions when already allowed',async()=>{
 const first=setup('default',false);expect(await syncDevicePush(true)).toBe(true);expect(first.requestPermission).toHaveBeenCalledTimes(1);expect(first.subscribe).toHaveBeenCalledTimes(1);
 const restored=setup('granted',false);expect(await syncDevicePush()).toBe(true);expect(restored.requestPermission).not.toHaveBeenCalled();expect(restored.subscribe).toHaveBeenCalledTimes(1);
});
it('does not report active notifications when saving to the server fails',async()=>{
 const api=setup('granted');api.fetch.mockImplementation(async(_url,init)=>init?.method==='POST'?Response.json({error:'unavailable'},{status:503}):Response.json({publicKey:'BElzb2xhdGVkLXRlc3Q'}));
 await expect(syncDevicePush()).rejects.toThrow('הסנכרון לשרת לא הושלם');
});
it('does not repeatedly prompt after permission was denied',async()=>{
 const api=setup('denied');expect(await syncDevicePush()).toBe(false);await expect(syncDevicePush(true)).rejects.toThrow('הגדרות המכשיר');expect(api.requestPermission).not.toHaveBeenCalled();
});
