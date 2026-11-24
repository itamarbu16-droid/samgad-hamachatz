const route='/api/push/manual-device';
const scope='/manual-alerts-v1/';
const script=scope+'sw.js';
const version=1;
function checkAbort(signal:AbortSignal){if(signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError');}
export type ManualDeviceState='unavailable'|'install'|'denied'|'ready'|'registered';
export function manualDeviceCapability():ManualDeviceState{
 const appleMobile=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=window.matchMedia?.('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone;
 if(appleMobile&&!standalone)return 'install';
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return 'unavailable';
 return Notification.permission==='denied'?'denied':'ready';
}
async function request(method:string,signal:AbortSignal,body?:object,context?:string){
 checkAbort(signal);
 const response=await fetch(route,{method,cache:'no-store',signal,...(body?{headers:{'Content-Type':'application/json','X-Samgad-Manual-Device-Context':context!},body:JSON.stringify({version,...body})}:{})});
 if(response.status===409){
  const details=await response.json().catch(()=>null);
  const stale=details?.code==='MANUAL_DEVICE_CONTEXT_CHANGED'||details?.error==='החשבון או ההתחברות השתנו. יש לפתוח מחדש את ההרשמה';
  if(!stale&&['POST','DELETE'].includes(method))throw Error('לא ניתן לשנות את הרשמת המכשיר לחשבון הזה. אם הוא רשום בחשבון קודם, כבו שם את התזכורות הידניות או השתמשו בדפדפן אחר.');
  throw Error('החיבור לחשבון השתנה. רעננו את האפליקציה לפני ניסיון נוסף.');
 }
 if(!response.ok)throw Error('לא ניתן לאמת את הרשמת המכשיר כרגע. נסו שוב בעוד רגע.');
 const data=await response.json();
 checkAbort(signal);
 return data;
}
function decodePublicKey(key:unknown):Uint8Array<ArrayBuffer>{
 if(typeof key!=='string'||!/^[A-Za-z0-9_-]+$/.test(key))throw Error('מפתח ההתראות אינו זמין.');
 const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 if(bytes.length!==65||bytes[0]!==4)throw Error('מפתח ההתראות אינו תקין.');
 return bytes;
}
function matchesKey(subscription:PushSubscription,key:Uint8Array){
 const buffer=subscription.options.applicationServerKey;
 if(!buffer)return false;
 const actual=new Uint8Array(buffer);
 return actual.length===key.length&&actual.every((value,i)=>value===key[i]);
}
function verifyWorker(worker:ServiceWorker,signal:AbortSignal){
 checkAbort(signal);
 if(worker.scriptURL!==new URL(script,location.origin).href)throw Error('רכיב ההתראות אינו תואם. אין שינוי בהתראות הקיימות.');
 return new Promise<void>((resolve,reject)=>{
  const channel=new MessageChannel();
  const fail=()=>finish(Error('לא התקבל אישור מרכיב ההתראות.'));
  const abort=()=>finish(signal.reason);
  const timer=setTimeout(fail,4000);
  function finish(error?:unknown){
   clearTimeout(timer);signal.removeEventListener('abort',abort);channel.port1.close();
   if(error)reject(error);else resolve();
  }
  signal.addEventListener('abort',abort,{once:true});
  channel.port1.onmessage=event=>{if(event.data?.version===version)finish();else fail();};
  try{worker.postMessage({type:'samgad-manual-alerts-protocol'},[channel.port2]);}catch(error){finish(error);}
 });
}
async function getRegistration(){
 const candidate=await navigator.serviceWorker.getRegistration(new URL(scope,location.origin).href);
 if(!candidate||candidate.scope!==new URL(scope,location.origin).href)return undefined;
 for(const worker of [candidate.active,candidate.waiting,candidate.installing]){
  if(worker&&worker.scriptURL!==new URL(script,location.origin).href)throw Error('רכיב ההתראות אינו תואם. אין שינוי בהתראות הקיימות.');
 }
 return candidate;
}
async function getConfiguration(expectedAccount:string,signal:AbortSignal){
 const config=await request('GET',signal);
 if(config.version!==version||typeof config.context!=='string'||!config.context||typeof config.account?.userId!=='string'||!config.account.userId||typeof config.account?.organizationId!=='string'||!config.account.organizationId||JSON.stringify([config.account.organizationId,config.account.userId])!==expectedAccount)throw Error('החיבור לחשבון השתנה. רעננו את האפליקציה לפני ניסיון נוסף.');
 return config as {publicKey:string|null;context:string};
}
export async function getManualDeviceState(expectedAccount:string,signal:AbortSignal):Promise<{state:ManualDeviceState;context?:string;publicKey?:string}>{
 const capability=manualDeviceCapability();
 if(capability==='unavailable')return {state:capability};
 const config=await getConfiguration(expectedAccount,signal);
 const result=(state:ManualDeviceState)=>({state,context:config.context});
 if(capability!=='ready'||Notification.permission!=='granted'||!config.publicKey)return result(capability);
 const registration=await getRegistration();
 if(!registration?.active)return result('ready');
 await verifyWorker(registration.active,signal);
 const subscription=await registration.pushManager.getSubscription();
 if(!subscription||!matchesKey(subscription,decodePublicKey(config.publicKey)))return result('ready');
 const state=await request('PATCH',signal,{endpoint:subscription.endpoint},config.context);
 return state.registered===true?{...result('registered'),publicKey:config.publicKey}:result('ready');
}
async function waitForActive(registration:ServiceWorkerRegistration,signal:AbortSignal){
 for(let i=0;i<60;i++){
  checkAbort(signal);
  if(registration.active?.state==='activated')return registration.active;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('רכיב ההתראות עדיין לא מוכן. נסו שוב.');
}
export async function enableManualDevice(context:string,signal:AbortSignal){
 checkAbort(signal);
 if(!context)throw Error('לא ניתן לאמת את החיבור לחשבון.');
 if(manualDeviceCapability()!=='ready')throw Error('המכשיר עדיין לא מוכן לקבל התראות.');
 const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
 checkAbort(signal);
 if(permission!=='granted')return permission==='denied'?'denied':'ready';
 const previous=await getRegistration();
 const config=await request('PUT',signal,{action:'key'},context);
 if(config.version!==version)throw Error('גרסת ההתראות אינה תואמת.');
 const applicationServerKey=decodePublicKey(config.publicKey);
 const registration=previous||await navigator.serviceWorker.register(script,{scope,updateViaCache:'none'});
 const worker=await waitForActive(registration,signal);
 await verifyWorker(worker,signal);
 checkAbort(signal);
 let subscription=await registration.pushManager.getSubscription();
 if(subscription&&!matchesKey(subscription,applicationServerKey))throw Error('קיימת הרשמה אחרת. היא לא שונתה.');
 checkAbort(signal);
 subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
 checkAbort(signal);
 if(!matchesKey(subscription,applicationServerKey))throw Error('לא ניתן לאמת את מפתח ההרשמה.');
 await request('POST',signal,{endpoint:subscription.endpoint},context);
 const state=await request('PATCH',signal,{endpoint:subscription.endpoint},context);
 if(state.registered!==true)throw Error('עדיין לא התקבל אישור הרשמה למכשיר הזה.');
 return 'registered' as const;
}

export async function disableManualDevice(context:string,publicKey:string,signal:AbortSignal){
 checkAbort(signal);
 if(!context)throw Error('לא ניתן לאמת את החיבור לחשבון.');
 const registration=await getRegistration();
 if(!registration?.active)throw Error('לא נמצאה הרשמה ייעודית במכשיר הזה.');
 await verifyWorker(registration.active,signal);
 const subscription=await registration.pushManager.getSubscription();
 if(!subscription||!matchesKey(subscription,decodePublicKey(publicKey)))throw Error('לא נמצאה הרשמה ייעודית תואמת במכשיר הזה.');
 const active=await request('PATCH',signal,{endpoint:subscription.endpoint},context);
 if(active.registered!==true)throw Error('אין הרשמה פעילה למכשיר הזה בחשבון הנוכחי.');
 await request('DELETE',signal,{endpoint:subscription.endpoint},context);
}
