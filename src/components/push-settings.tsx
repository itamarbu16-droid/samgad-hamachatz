'use client';
import {useState} from 'react';
export function PushSettings(){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function enable(){
  setBusy(true);setMessage('');
  try{
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('באייפון: הוסף למסך הבית ופתח את האפליקציה משם כדי להפעיל התראות.');
   if(await Notification.requestPermission()!=='granted')throw Error('יש לאשר התראות בהגדרות המכשיר כדי לקבל עדכונים.');
   const registration=await navigator.serviceWorker.ready,r=await fetch('/api/push'),data=await r.json();if(!r.ok)throw Error(data.error);
   const raw=atob(data.publicKey.replace(/-/g,'+').replace(/_/g,'/')),key=Uint8Array.from(raw,c=>c.charCodeAt(0));
   const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
   const saved=await fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON())});if(!saved.ok)throw Error('לא ניתן לשמור את הרשמת ההתראות. נסה שוב.');
   setMessage('התראות הופעלו במכשיר הזה');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="push-settings"><button className="button secondary" disabled={busy} onClick={()=>void enable()}>{busy?'מפעיל…':'הפעל התראות בטלפון'}</button>{message&&<p role="status">{message}</p>}</div>;
}
