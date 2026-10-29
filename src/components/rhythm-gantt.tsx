'use client';
import {useState} from 'react';
import {frequencies,monthEnd,addDays} from '@/lib/rhythm';
import {periodSegments} from '@/lib/rhythm-periods';
import type {Item,Occurrence} from './task-composer';
const dateLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('he-IL',{day:'numeric',month:'numeric'});
export function RhythmGantt({items,occurrences,month,today,busy,canWrite,filter,onToggle,onEdit}:{items:Item[];occurrences:Occurrence[];month:string;today:string;busy:boolean;canWrite:boolean;filter:string;onToggle:(item:Item,row:Occurrence)=>void;onEdit:(item:Item)=>void}){
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
  <div className="gantt-caption"><div><h2>שעל״ח סמג״ד</h2><p>✓ נשמר לכל התקופה. בתחילת התקופה הבאה נפתח ריבוע חדש; הביצועים הקודמים נשמרים.</p><strong>{current.filter(r=>r?.done).length} מתוך {current.length} בוצעו בתקופה הנוכחית</strong></div><button className="button secondary" onClick={()=>setHistory(!history)} aria-expanded={history}>היסטוריית ביצועים</button></div>
  <div className="gantt-scroll" tabIndex={0} role="region" aria-label="טבלה בגלילה אופקית"><table className="rhythm-gantt"><caption>מעקב ביצוע לחודש {month}</caption><thead><tr><th scope="col" className="gantt-title">משימה / תדירות</th>{days.map(day=><th scope="col" key={day} className={day===today?'gantt-today':''}><span>{Number(day.slice(-2))}</span><small>{new Date(day+'T12:00:00Z').toLocaleDateString('he-IL',{weekday:'short'})}</small></th>)}</tr></thead><tbody>{rows.map(({item,periods})=><tr key={item.id}><th scope="row" className="gantt-title"><button onClick={()=>onEdit(item)} disabled={!canWrite}>{item.title}</button><small>{frequencies[item.frequency]}</small></th>{periods[0].from>days[0]&&<td colSpan={Number(periods[0].from.slice(-2))-1} className="gantt-inactive">—</td>}{periods.map(period=>{
   const row=byPeriod.get(item.id+':'+period.start),future=period.start>today,done=Boolean(row?.done),stamp=row?.completedAt||Object.values(row?.completions||{})[0];
   const label=`${item.title} · ${dateLabel(period.start)}–${dateLabel(period.end)}`;
   return <td key={period.start} colSpan={period.days} className={`gantt-period ${done?'gantt-done':future?'gantt-future':period.end<today?'gantt-missed':'gantt-current'}`}><button role="checkbox" aria-checked={done} aria-label={label} title={stamp?`בוצע ב־${new Date(stamp).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'})}`:label} disabled={busy||!canWrite||!row||future} onClick={()=>row&&onToggle(item,row)}><span className="gantt-check">{done?'✓':''}</span>{period.days>1&&<small>{done&&stamp?`בוצע ${dateLabel(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp)))}`:dateLabel(period.start)+'–'+dateLabel(period.end)}</small>}</button></td>;
  })}{periods.at(-1)!.to<days.at(-1)!&&<td className="gantt-inactive" colSpan={Number(days.at(-1)!.slice(-2))-Number(periods.at(-1)!.to.slice(-2))}>—</td>}</tr>)}</tbody></table></div>
  {!rows.length&&<p>אין משימות שעל״ח בתצוגה הזאת.</p>}
  <p className="gantt-legend">ירוק: בוצע · כתום: התקופה הנוכחית · אדום: תקופה שהסתיימה ללא ביצוע · אפור: עתידי</p>
  {history&&<div className="gantt-history"><h3>ביצועים שמורים</h3>{occurrences.filter(row=>row.done&&items.some(item=>item.id===row.itemId)).sort((a,b)=>(b.completedAt||b.dueDate).localeCompare(a.completedAt||a.dueDate)).map(row=><p key={row.id}><strong>{items.find(item=>item.id===row.itemId)?.title}</strong> · תקופה {dateLabel(row.scheduledDate||row.dueDate)} · בוצע {row.completedAt?new Date(row.completedAt).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'}):'✓'}</p>)}</div>}
 </section>;
}
