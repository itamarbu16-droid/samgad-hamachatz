'use client';
import {useEffect,useState} from 'react';
import {syncDevicePush} from '@/lib/device-push';

/** Mounted for the authenticated workspace, even when the More menu is closed. */
export function PushAutoRestore(){
 useEffect(()=>{
  let running=false;
  const restore=async()=>{
   if(running||!navigator.onLine||document.visibilityState==='hidden')return;
   running=true;try{await syncDevicePush();}catch{/* Retry on the next entry or restored connection. */}finally{running=false;}
  };
  void restore();
  const visible=()=>{if(document.visibilityState==='visible')void restore();};
  window.addEventListener('online',restore);document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('online',restore);document.removeEventListener('visibilitychange',visible);};
 },[]);
 return null;
}
export function PushSettings(){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[active,setActive]=useState(false),[checking,setChecking]=useState(true);
 useEffect(()=>{
  let mounted=true;
  void syncDevicePush().then(enabled=>{if(mounted)setActive(enabled);}).catch(error=>{if(mounted)setMessage((error as Error).message);}).finally(()=>{if(mounted)setChecking(false);});
  return()=>{mounted=false;};
 },[]);
 async function enable(){
  setBusy(true);setMessage('');
  try{setActive(await syncDevicePush(true));setMessage('ההרשאה נשמרת במכשיר הזה ותסונכרן אוטומטית בכניסה הבאה.');}
  catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
 }
 return <div className="push-settings">{active?<p role="status">✓ המכשיר רשום לקבלת התראות</p>:<button className="button secondary" disabled={busy||checking} onClick={()=>void enable()}>{checking?'בודק התראות…':busy?'מפעיל…':'הפעל התראות בטלפון'}</button>}{message&&<p role="status">{message}</p>}<p className="muted">תזכורת מרוכזת ב־08:00 וב־18:00, לפי שעון ישראל, למשימות שלך שדחופות, באיחור או לקראת תג״ב. ההרשמה במכשיר אינה אישור שהודעה כבר נמסרה.</p></div>;
}
