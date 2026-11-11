"use client";
import {useCallback,useEffect,useState} from 'react';
import {CalendarConnection} from './task-calendar';
type Agenda={connected:boolean;selectionRequired?:boolean;events:Array<{id:string;title:string;start:string;end:string;allDay:boolean;location:string}>};
type Calendar={id:string;name:string;canWrite:boolean};
async function read(url:string,init?:RequestInit){const response=await fetch(url,{cache:'no-store',...init});const data=await response.json();if(!response.ok)throw Error(data.error||'לא ניתן לטעון את הלו״ז');return data;}
const date=(value:string,allDay:boolean)=>new Date(allDay?value+'T12:00:00':value).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem',weekday:'long',day:'numeric',month:'numeric',...(!allDay?{hour:'2-digit',minute:'2-digit'}:{})});
export function Schedule({owner,manager=owner}:{owner:boolean;manager?:boolean}){
 const [agenda,setAgenda]=useState<Agenda|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[calendars,setCalendars]=useState<Calendar[]>([]),[selected,setSelected]=useState(''),[savedSource,setSavedSource]=useState('');
 const load=useCallback(async()=>{
  setBusy(true);setError('');
  // Source selection must remain available even when the old calendar was removed or lost permission.
  const [events,source]=await Promise.allSettled([read('/api/calendar/agenda'),owner?read('/api/calendar/source'):Promise.resolve(null)]);
  const errors:string[]=[];
  if(events.status==='fulfilled')setAgenda(events.value);else{setAgenda(null);errors.push(events.reason instanceof Error?events.reason.message:'לא ניתן לטעון אירועים');}
  if(source.status==='fulfilled'&&source.value){setCalendars(source.value.calendars);setSelected(source.value.selected);setSavedSource(source.value.selected);}
  else if(source.status==='rejected'){setCalendars([]);errors.push(source.reason instanceof Error?source.reason.message:'לא ניתן לטעון את רשימת היומנים');}
  setError([...new Set(errors)].join(' · '));setBusy(false);
 },[owner]);
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==='visible')void load();};const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);window.addEventListener('samgad:calendar-changed',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('samgad:calendar-changed',refresh);};},[load]);
 async function saveSource(){if(!selected||busy)return;setBusy(true);setError('');try{await read('/api/calendar/source',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({calendarId:selected})});await load();window.dispatchEvent(new Event('samgad:saved'));}catch(e){setError(e instanceof Error?e.message:'לא ניתן לשמור');}finally{setBusy(false);}}
 const chosen=calendars.find(calendar=>calendar.id===selected);
 return <div className="schedule-page"><section className="panel"><div className="section-heading"><h2>לו״ז</h2><button className="button secondary" disabled={busy} onClick={()=>void load()}>{busy?'מעדכן…':'רענון'}</button></div><p>{owner?'בחר את לו״ז סמג״ד להצגת אירועים ולשיבוץ משימות. כתוב את התפקיד בכותרת או בתיאור האירוע כדי שיופיע אצל בעל התפקיד.':manager?'אירועי הלו״ז הגדודי ל־90 הימים הקרובים.':'האירועים הרלוונטיים אליך ל־90 הימים הקרובים, לפי שיוך התפקיד שלך או הזמנה למייל שלך.'}</p>{error&&<p role="alert">{error}</p>}
 {owner&&calendars.length>0&&<div className="calendar-source"><label>יומן הלו״ז<select value={selected} disabled={busy} onChange={event=>setSelected(event.target.value)}><option value="" disabled>בחר לו״ז סמג״ד</option>{selected&&!chosen&&<option value={selected} disabled>היומן הקודם אינו זמין — בחר יומן אחר</option>}{calendars.map(calendar=><option value={calendar.id} key={calendar.id}>{calendar.name}{calendar.canWrite?'':' (לצפייה בלבד)'}</option>)}</select></label>{chosen&&!chosen.canWrite&&<p>אפשר להציג את היומן הזה, אך הוספת משימות דורשת הרשאת עריכה ב־Google Calendar.</p>}<button className="button primary" disabled={busy||!chosen||selected===savedSource} onClick={()=>void saveSource()}>שמור את בחירת היומן</button></div>}
 {agenda&&!agenda.connected&&<p role="status">{owner?'חבר את חשבון Google שלך כדי להציג לו״ז.':'מנהל המרחב טרם חיבר יומן לו״ז.'}</p>}
 {agenda?.selectionRequired&&<p role="status">{owner?'החשבון מחובר. בחר למעלה את לו״ז סמג״ד ושמור כדי להציג את האירועים.':'מנהל המרחב צריך לבחור את יומן הלו״ז.'}</p>}
 {agenda?.connected&&!agenda.selectionRequired&&!agenda.events.length&&<p role="status">אין אירועים להצגה בטווח הזה.</p>}
 <div className="schedule-events">{agenda?.events.map(event=><article className="panel" key={event.id}><h3>{event.title}</h3><p><time dateTime={event.start}>{date(event.start,event.allDay)}</time>{event.allDay?' · יום שלם':` — ${date(event.end,false)}`}</p>{event.location&&<p>{event.location}</p>}</article>)}</div></section>{owner&&<CalendarConnection/>}</div>;
}
