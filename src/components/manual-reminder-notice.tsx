"use client";

import {useEffect,useState,type MouseEvent} from 'react';
import {BellRing,X} from 'lucide-react';

type Reminder={id:string;url:string};
const endpoint='/api/push/task-reminder';
function safeDestination(url:string){
 try{const parsed=new URL(url,location.origin);
  return parsed.origin===location.origin&&['/','/deputies'].includes(parsed.pathname)?parsed:null;
 }catch{return null;}
}

export default function ManualReminderNotice(){
 const [notice,setNotice]=useState<Reminder|null>(null);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let seq=0;const controller=new AbortController();
  const refresh=async()=>{
   if(document.visibilityState==='hidden')return;
   const current=++seq;
   try{
    const response=await fetch(endpoint,{cache:'no-store',signal:controller.signal});
    if(!response.ok){
     if((response.status===401||response.status===403)&&!controller.signal.aborted&&current===seq)setNotice(null);
     return;
    }
    const rows=await response.json();
    const row=Array.isArray(rows)?rows[0]:null;
    if(!controller.signal.aborted&&current===seq)setNotice(row&&typeof row.id==='string'&&typeof row.url==='string'&&safeDestination(row.url)?{id:row.id,url:row.url}:null);
   }catch{/* The existing task and due screens remain available offline. */}
  };
  void refresh();
  const timer=window.setInterval(refresh,60000);
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('samgad:manual-reminder-seen',refresh);
  window.addEventListener('samgad:saved',refresh);
  return()=>{controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('samgad:manual-reminder-seen',refresh);window.removeEventListener('samgad:saved',refresh);};
 },[]);
 async function acknowledge(id:string){
  setBusy(true);
  try{
   const r=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
   if(r.ok){setNotice(current=>current?.id===id?null:current);window.dispatchEvent(new Event('samgad:manual-reminder-seen'));}
  }catch{/* Don't pretend to acknowledge when offline. */}finally{setBusy(false);}
 }
 function follow(event:MouseEvent<HTMLAnchorElement>,row:Reminder){
  const url=safeDestination(row.url);if(!url){event.preventDefault();return;}
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
  event.preventDefault();
  void acknowledge(row.id);
  if(location.pathname!==url.pathname){location.assign(url.href);return;}
  history.pushState({},'',url.href);window.scrollTo({top:0,behavior:'instant'});
  window.dispatchEvent(new PopStateEvent('popstate'));
 }
 if(!notice)return null;
 return <aside className="rhythm-notice manual-reminder-notice" aria-label="תזכורת אישית למשימה">
  <BellRing size={20} aria-hidden="true"/><span>יש לך תזכורת חדשה למשימה באיחור.</span>
  <a className="button secondary" href={notice.url} onClick={event=>follow(event,notice)}>פתיחת המשימה</a>
  <button type="button" className="icon-button" aria-label="סגירת תזכורת אישית" disabled={busy} onClick={()=>void acknowledge(notice.id)}><X size={17} aria-hidden="true"/></button>
 </aside>;
}
