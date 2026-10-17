"use client";
import {ChevronLeft} from 'lucide-react';
import {summarizeTasks,type SnapshotTask} from '@/lib/task-snapshot';
export default function TaskSnapshot({tasks,today,onFilter}:{tasks:SnapshotTask[];today:string;onFilter:(filter:string)=>void}){
 const counts=summarizeTasks(tasks,today);
 return <section className="command-snapshot personal-snapshot" aria-label="תמונת מצב אישית"><h2><ChevronLeft size={21}/>תמונת מצב אישית</h2><div className="command-stats">{[
  {n:counts.total,label:'סה״כ',tone:'total',filter:'all'},
  {n:counts.completed,label:'בוצעו',tone:'green',filter:'completed'},
  {n:counts.urgent,label:'דחוף',tone:'orange',filter:'due_soon'},
  {n:counts.overdue,label:'באיחור',tone:'red',filter:'overdue'},
 ].map(s=><button type="button" key={s.label} className={s.tone} onClick={()=>onFilter(s.filter)}><strong>{s.n}</strong><span>{s.label}</span></button>)}</div><small className="snapshot-note">המשימות האישיות שלך בלבד · כולל שעל״ח לחודש שנבחר · ללא נקודות לעיסוק</small></section>;
}
