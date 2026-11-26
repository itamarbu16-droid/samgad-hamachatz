"use client";
import {useState} from 'react';
import {Layers3,ChevronDown,NotebookPen,ClipboardCheck} from 'lucide-react';
import {currentMonth,useRhythm} from './use-rhythm';
import {responsibilityDomains} from '@/lib/responsibility-domains';
import {buildResponsibilityEntries} from '@/lib/responsibility-summary';
import {taskTone} from '@/lib/task-display';
type Task={id:string;title:string;description:string;status:string;dueDate:string|null;creatorId:string;ownerId:string;domainId:string};
export default function ResponsibilitySummary({tasks,users,workspaceOwnerId,manager,today}:{tasks:Task[];users:{id:string;name:string}[];workspaceOwnerId:string;manager:boolean;today:string}){
 const {data,error,load}=useRhythm(currentMonth());
 const [open,setOpen]=useState<string[]>([]),[showCompleted,setShowCompleted]=useState(false);
 const entries=data?buildResponsibilityEntries(tasks,{...data,people:[...data.people,...users.filter(u=>!data.people.some(p=>p.id===u.id)).map(u=>({...u,email:''}))]},workspaceOwnerId):[];
 const domains=[...responsibilityDomains.map(d=>({...d,id:String(d.id)})),...(entries.some(e=>!e.domainIds.length)?[{id:'unclassified',name:'ללא תחום',color:'#887f76'}]:[])];
 return <section className="responsibility-summary" aria-label="ריכוז אחריות"><div className="panel"><h2>אחריות — תמונת מצב לפי תחום</h2><p>משימות ונקודות לעיסוק, לפי התוכן ובעלי התפקידים. לחיצה על פריט פותחת אותו לעדכון.</p><label><input type="checkbox" checked={showCompleted} onChange={e=>setShowCompleted(e.target.checked)}/> הצג גם פריטים שבוצעו</label></div>
 {error&&<p role="alert">{error} <button className="button secondary" onClick={()=>void load()}>נסה שוב</button></p>}
 {!data&&!error&&<p role="status">טוען את ריכוז המשימות והנקודות…</p>}
 {data&&<div className="responsibility-grid">{domains.map(domain=>{
  const all=entries.filter(e=>domain.id==='unclassified'?!e.domainIds.length:e.domainIds.includes(domain.id));
  const visible=all.filter(e=>showCompleted||!e.done),expanded=open.includes(domain.id);
  return <section className="panel responsibility-domain" key={domain.id} style={{borderTopColor:domain.color}}><button type="button" className="responsibility-toggle" aria-expanded={expanded} aria-controls={'responsibility-'+domain.id} onClick={()=>setOpen(ids=>expanded?ids.filter(id=>id!==domain.id):[...ids,domain.id])}><Layers3 size={23}/><strong>{domain.name}</strong><ChevronDown size={19}/></button>
   <div className="responsibility-counts"><span><b>{all.filter(e=>!e.done&&e.kind==='task').length}</b> משימות פתוחות</span><span><b>{all.filter(e=>!e.done&&e.kind==='point').length}</b> נקודות לעיסוק</span><span className="late"><b>{all.filter(e=>!e.done&&e.dueDate&&e.dueDate<today).length}</b> באיחור</span></div>
   {expanded&&<div id={'responsibility-'+domain.id} className="responsibility-items">{visible.length?visible.map(entry=><a key={entry.id} className={`responsibility-entry ${taskTone(entry.done,entry.dueDate,today)}`} href={entry.href}><span className="responsibility-entry-kind">{entry.kind==='point'?<NotebookPen size={17}/>:<ClipboardCheck size={17}/>} {entry.kind==='point'?'נקודה לעיסוק':'משימה'}{entry.done?' · בוצע':''}</span><strong>{entry.title}</strong>{entry.description&&<small>{entry.description}</small>}<span>{entry.owner}</span><time>{entry.dueDate?`תג״ב: ${new Date(entry.dueDate+'T12:00:00').toLocaleDateString('he-IL')}`:'ללא תג״ב'}</time></a>):<p className="empty">אין פריטים {showCompleted?'להצגה':'פתוחים'} בתחום.</p>}</div>}
  </section>;
 })}</div>}
 {!manager&&<p className="snapshot-note">מוצגים רק פריטים שיש לך הרשאה לראות.</p>}
 </section>;
}
