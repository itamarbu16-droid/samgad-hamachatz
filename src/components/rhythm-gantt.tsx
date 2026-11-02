'use client';
import {useState} from 'react';
import {frequencies,monthEnd,addDays} from '@/lib/rhythm';
import {periodSegments} from '@/lib/rhythm-periods';
import type {Item,Occurrence} from './task-composer';
const dateLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('he-IL',{day:'numeric',month:'numeric'});
export function RhythmGantt({items,occurrences,month,today,busy,canWrite,filter,onToggle,onEdit}:{items:Item[];occurrences:Occurrence[];month:string;today:string;busy:boolean;canWrite:boolean;filter:string;onToggle:(item:Item,row:Occurrence,day:string,checked:boolean)=>void;onEdit:(item:Item)=>void}){
 const [history,setHistory]=useState(false);
 const days=Array.from({length:Number(monthEnd(month).slice(-2))},(_,i)=>addDays(month+'-01',i));
 const byPeriod=new Map(occurrences.map(row=>[row.itemId+':'+(row.scheduledDate||row.dueDate),row]));
 const rows=[...items].sort((a,b)=>Object.keys(frequencies).indexOf(a.frequency)-Object.keys(frequencies).indexOf(b.frequency)||a.title.localeCompare(b.title,"he")).filter(item=>!item.archived&&item.category!=='point'&&item.frequency!=='once').map(item=>({item,periods:periodSegments(item,month)})).filter(({item,periods})=>periods.length&&periods.some(period=>{
  const row=byPeriod.get(item.id+':'+period.start);
  if(filter==='completed')return row?.done;
  if(filter==='open'||filter==='active'||filter==='actionable')return !row?.done;
  if(filter==='overdue')return period.end<today&&!row?.done;
  if(filter==='today')return period.start<=today&&period.end>=today;
  return true;
 }));
 const current=rows.flatMap(({item,periods})=>periods.filter(p=>p.start<=today&&p.end>=today).map(p=>byPeriod.get(item.id+':'+p.start)));
 return <section className="rhythm-gantt-panel" aria-label="טבלת מעקב שעל״ח">
  <div className="gantt-caption"><div><h2>שעל״ח — {new Date(month+'-01T12:00:00Z').toLocaleDateString('he-IL',{month:'long',year:'numeric'})}</h2><p>עמודה לכל יום בחודש. סמנו ✓ ביום הביצוע; הסימון ייחשב לביצוע המשימה בתקופה שלה, וההיסטוריה תישמר.</p><strong>{current.filter(r=>r?.done).length} מתוך {current.length} בוצעו בתקופה הנוכחית</strong></div><button className="button secondary" onClick={()=>setHistory(!history)} aria-expanded={history}>היסטוריית ביצועים</button></div>
  <div className="gantt-scroll" tabIndex={0} role="region" aria-label="טבלה בגלילה אופקית"><table className="rhythm-gantt"><caption>מעקב ביצוע לחודש {month}</caption><thead><tr><th scope="col" className="gantt-title">משימה / תדירות</th>{days.map(day=><th scope="col" key={day} className={day===today?'gantt-today':''}><span>{Number(day.slice(-2))}</span><small>{new Date(day+'T12:00:00Z').toLocaleDateString('he-IL',{weekday:'short'})}</small></th>)}</tr></thead><tbody>{rows.map(({item,periods})=><tr key={item.id}><th scope="row" className="gantt-title"><button onClick={()=>onEdit(item)} disabled={!canWrite}>{item.title}</button><small>{frequencies[item.frequency]}</small></th>{days.map(day=>{
   const period=periods.find(p=>day>=p.from&&day<=p.to);
   if(!period)return <td key={day} className="gantt-inactive">—</td>;
   const row=byPeriod.get(item.id+':'+period.start);
   const stamp=Object.values(row?.completions||{})[0]||row?.completedAt;
   const performed=stamp?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp)):null;
   const checked=Boolean(row?.done&&performed===day),future=day>today;
   const label=`${item.title} · ${dateLabel(day)} · ${frequencies[item.frequency]}`;
   const doneInAnotherMonth=Boolean(row?.done&&performed&&!performed.startsWith(month));
   return <td key={day} className={`gantt-period ${checked?'gantt-done':future?'gantt-future':row?.done?'gantt-satisfied':period.end<today?'gantt-missed':'gantt-current'} ${day===period.from?'gantt-period-start':''}`}><button role="checkbox" aria-checked={checked} aria-label={label} title={row?.done&&performed?`בוצע ב־${dateLabel(performed)} · ${label}`:label} disabled={busy||!canWrite||!row||future} onClick={()=>row&&onToggle(item,row,day,checked)}><span className="gantt-check">{checked?'✓':''}</span>{doneInAnotherMonth&&day===period.from&&<span className="gantt-period-note">✓ {dateLabel(performed!)}</span>}</button></td>;
  })}</tr>)}</tbody></table></div>
  {!rows.length&&<p>אין משימות שעל״ח בתצוגה הזאת.</p>}
  <p className="gantt-legend">✓ ירוק: יום הביצוע · רקע ירקרק: המשימה בוצעה בתקופה · כתום: לביצוע · אדום: תקופה שהסתיימה ללא ביצוע · אפור: עתידי</p>
  {history&&<div className="gantt-history"><h3>ביצועים שמורים</h3>{occurrences.filter(row=>row.done&&items.some(item=>item.id===row.itemId)).sort((a,b)=>(b.completedAt||b.dueDate).localeCompare(a.completedAt||a.dueDate)).map(row=><p key={row.id}><strong>{items.find(item=>item.id===row.itemId)?.title}</strong> · תקופה {dateLabel(row.scheduledDate||row.dueDate)} · בוצע {(Object.values(row.completions)[0]||row.completedAt)?new Date(Object.values(row.completions)[0]||row.completedAt!).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'}):'✓'}</p>)}</div>}
 </section>;
}
