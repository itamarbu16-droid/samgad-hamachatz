'use client';
import {useEffect,useRef,useState} from 'react';
import {disableManualDevice,enableManualDevice,getManualDeviceState,type ManualDeviceState} from '@/lib/manual-device-client';

const changed='samgad:manual-device-changed';
const dismissedAccounts=new Set<string>();
export function ManualDevicePrompt({account,preferences=false}:{account:string;preferences?:boolean}){
 const [state,setState]=useState<ManualDeviceState|null>(null);
 const [dismissed,setDismissed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const publicKey=useRef<string|undefined>(undefined);
 const context=useRef<string|undefined>(undefined);
 const lifetime=useRef<AbortController|null>(null);
 const storageKey='samgad:manual-push-dismissed:'+encodeURIComponent(account);
 useEffect(()=>{
  const controller=new AbortController();lifetime.current=controller;
  let revision=0;
  const readDismissed=()=>{try{return sessionStorage.getItem(storageKey)==='1';}catch{return false;}};
  const load=async()=>{
   if(dismissedAccounts.has(storageKey))setDismissed(true);
   const current=++revision;
   if(document.visibilityState==='hidden')return;
   try{
    const next=await getManualDeviceState(account,controller.signal);
    if(!controller.signal.aborted&&revision===current){context.current=next.context;publicKey.current=next.publicKey;setState(next.state);setMessage('');}
   }catch(error){
    if(!controller.signal.aborted&&revision===current){
     context.current=undefined;publicKey.current=undefined;setState(null);
     if(preferences)setMessage(error instanceof Error?error.message:'לא ניתן לבדוק את מצב ההתראות.');
    }
   }
  };
  setDismissed(dismissedAccounts.has(storageKey)||readDismissed());void load();
  window.addEventListener(changed,load);window.addEventListener('online',load);document.addEventListener('visibilitychange',load);
  return()=>{controller.abort();window.removeEventListener(changed,load);window.removeEventListener('online',load);document.removeEventListener('visibilitychange',load);};
 },[account,preferences,storageKey]);
 function dismiss(){
  dismissedAccounts.add(storageKey);
  try{sessionStorage.setItem(storageKey,'1');}catch{/* Session-only fallback above. */}
  setDismissed(true);
 }
 async function enable(){
  const controller=lifetime.current;
  if(!controller||controller.signal.aborted||busy||state!=='ready'||!context.current)return;
  setBusy(true);setMessage('');
  try{
   const next=await enableManualDevice(context.current,controller.signal);
   if(!controller.signal.aborted){setState(next);if(next==='registered')window.dispatchEvent(new Event(changed));}
  }catch(error){
   if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'הפעלת ההתראות לא הושלמה.');
  }finally{if(!controller.signal.aborted)setBusy(false);}
 }
 async function disable(){
  const controller=lifetime.current;
  if(!preferences||state!=='registered'||busy||!controller||controller.signal.aborted||!context.current||!publicKey.current)return;
  setBusy(true);setMessage('');
  try{
   await disableManualDevice(context.current,publicKey.current,controller.signal);
   if(!controller.signal.aborted){dismiss();setState('ready');window.dispatchEvent(new Event(changed));}
  }catch(error){
   if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'כיבוי התזכורות לא הושלם.');
  }finally{if(!controller.signal.aborted)setBusy(false);}
 }
 if(!preferences&&(dismissed||state===null||state==='registered'||state==='unavailable'))return null;
 return <section className="panel document-upload" aria-label="תזכורות ידניות במכשיר">
  <strong>תזכורות ידניות במכשיר הזה</strong>
  {state!=='registered'&&state!=='unavailable'&&<p>אפשר לקבל התראה כשנשלחת אליך תזכורת ידנית למשימה.</p>}
  {state==='install'&&<p>באייפון: בספארי בחרו ״שיתוף״, ״הוספה למסך הבית״, ופתחו את האפליקציה מהסמל החדש.</p>}
  {state==='denied'&&<p>ההתראות חסומות. אפשר לאפשר אותן בהגדרות ההתראות של המכשיר או בהרשאות האתר, ואז לחזור לכאן.</p>}
  {state==='unavailable'&&<p>המכשיר או הדפדפן לא תומכים בהתראות כאן.</p>}
  {state==='registered'&&<p role="status">המכשיר רשום לקבלת תזכורות ידניות לחשבון הזה.</p>}
  {state===null&&!message&&<p role="status">בודק אם המכשיר רשום…</p>}
  {state==='ready'&&<button type="button" className="button primary" disabled={busy} onClick={()=>void enable()}>{busy?'מפעיל…':'הפעלת תזכורות ידניות'}</button>}
  {preferences&&state==='registered'&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void disable()}>{busy?'מכבה…':'כיבוי תזכורות ידניות במכשיר הזה'}</button>}
  {!preferences&&<button type="button" className="button secondary" onClick={dismiss}>לא עכשיו</button>}
  {message&&<p role="alert">{message}</p>}
 </section>;
}
