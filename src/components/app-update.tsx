"use client";
import {useEffect,useState} from 'react';
import {APP_RELEASE} from '@/lib/app-release';
import {offlineStatus,syncPending} from '@/lib/offline';
export default function AppUpdate(){
 const [available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  async function check(){if(!navigator.onLine||document.visibilityState==='hidden')return;try{const r=await fetch('/api/app-version',{cache:'no-store'});if(!r.ok)return;const j=await r.json();if(active&&typeof j.version==='string'&&j.version!==APP_RELEASE)setAvailable(true);}catch{/* offline is not an update */}}
  void check();const timer=setInterval(check,60000);document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);};
 },[]);
 async function update(){
  // Never reload an open form or lose an unsynchronized operation.
  if(document.querySelector('[role="dialog"]')){setError('יש לסיים או לסגור את חלון העריכה לפני העדכון.');return;}
  setBusy(true);setError('');try{await syncPending();if((await offlineStatus()).length){setError('יש שינויים שממתינים לסנכרון. נסה שוב לאחר הסנכרון.');return;}window.location.reload();}catch{setError('לא ניתן לעדכן כרגע. השינויים השמורים במכשיר נשמרו.');}finally{setBusy(false);}
 }
 if(!available)return null;
 return <aside className="app-update" aria-label="עדכון האפליקציה"><span>גרסה חדשה מוכנה</span><button className="button secondary" disabled={busy} onClick={()=>void update()}>{busy?'בודק סנכרון…':'עדכן אפליקציה'}</button>{error&&<p role="alert">{error}</p>}</aside>;
}
