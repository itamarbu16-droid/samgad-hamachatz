"use client";
import {useCallback,useEffect,useState} from 'react';
import {addDays} from '@/lib/rhythm';
type Event={id:string;title:string;start:string;end:string;allDay:boolean;groupIds?:string[]};
type Group={id:string;name:string};
const localDay=(value:string)=>value.length===10?value:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function WeeklySchedule({groups}:{groups?:Group[]}){
 const [agenda,setAgenda]=useState<{connected:boolean;events:Event[]}|null>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/calendar/agenda',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'לא ניתן לטעון את היומן');setAgenda(j);setError('');}catch(e){setError(e instanceof Error?e.message:'שגיאה בטעינה');}},[]);
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};const timer=setInterval(refresh,60000);window.addEventListener('samgad:saved',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);window.removeEventListener('samgad:saved',refresh);document.removeEventListener('visibilitychange',refresh);};},[load]);
 const today=localDay(new Date().toISOString()),start=addDays(today,-new Date(today+'T12:00:00Z').getUTCDay()),days=Array.from({length:7},(_,i)=>addDays(start,i));
 const weekly=(agenda?.events||[]).filter(event=>localDay(event.start)<=days[6]&&(event.allDay?event.end>start:localDay(event.end)>=start));
 const columns=groups||[{id:'mine',name:'הלו״ז שלי עם הסמג״ד'}];
 return <section className="panel weekly-schedule"><div className="section-heading"><h2>הלו״ז השבועי עם הסמג״ד</h2><button className="button secondary" onClick={()=>void load()}>רענון</button></div>
 {error&&<p role="alert">{error}</p>}{!agenda&&!error&&<p role="status">טוענים את אירועי השבוע…</p>}{agenda&&!agenda.connected&&<p>יש לחבר ולבחור יומן בעמוד הלו״ז כדי להציג את אירועי השבוע.</p>}
 {agenda?.connected&&<div className="weekly-role-grid">{columns.map(group=><article key={group.id}><h3>{group.name}</h3>{days.map(day=>{const events=weekly.filter(event=>(!groups||event.groupIds?.includes(group.id))&&localDay(event.start)<=day&&(event.allDay?event.end>day:localDay(event.end)>=day));return <div className="weekly-day" key={day}><strong>{new Date(day+'T12:00:00').toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'numeric'})}</strong>{events.length?events.map(event=><p key={event.id}><time>{event.allDay?'כל היום':new Date(event.start).toLocaleTimeString('he-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'})}</time> · {event.title}</p>):<small>אין אירועים משותפים</small>}</div>;})}</article>)}</div>}
 </section>;
}
