"use client";

import { useId,type CSSProperties } from 'react';
import { useSwipeCard } from './use-swipe-card';
import './swipe-card-motion.css';
import { ClockAlert,X } from 'lucide-react';
import { openDueReminderGroups,type DueReminderTask } from '@/lib/open-due-reminder';

const dateFormat=new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'short',timeZone:'Asia/Jerusalem'});

function TaskList({title,tasks}:{title:string;tasks:DueReminderTask[]}){
 if(!tasks.length)return null;
 const rows=(entries:DueReminderTask[])=><ul>{entries.map(task=><li key={task.id}>
  <span>{task.title}</span> <time dateTime={task.dueDate}>{dateFormat.format(new Date(task.dueDate+'T12:00:00Z'))}</time>
 </li>)}</ul>;
 return <div className="open-due-reminder-group">
  <h3>{title} ({tasks.length})</h3>
  {rows(tasks.slice(0,3))}
  {tasks.length>3&&<details><summary>עוד {tasks.length-3}</summary>{rows(tasks.slice(3))}</details>}
 </div>;
}

export default function OpenDueReminder({onDismiss,...props}:Parameters<typeof openDueReminderGroups>[0]&{onDismiss:()=>void}){
 const {overdue,soon}=openDueReminderGroups(props);
 if(!overdue.length&&!soon.length)return null;
 return <ReminderCard overdue={overdue} soon={soon} onDismiss={onDismiss}/>;
}

function ReminderCard({overdue,soon,onDismiss}:{overdue:DueReminderTask[];soon:DueReminderTask[];onDismiss:()=>void}){
 const heading=useId();
 const swipe=useSwipeCard<HTMLDivElement>(onDismiss,{commitOnUnmount:true});
 return <div {...swipe.shellProps} className={`swipe-motion-shell attention-swipe-shell ${swipe.phase==='exit'?'swipe-motion-collapse':''}`}>
 <div className="swipe-motion-clip">
  {swipe.moving&&<div className="swipe-motion-rail" aria-hidden="true"><X size={20}/></div>}
  <section className="open-due-reminder swipe-motion-front" aria-labelledby={heading} dir="rtl"
   data-motion={swipe.phase} style={{'--swipe-motion-x':swipe.offset+'px'} as CSSProperties}>
  <div className="open-due-reminder-heading">
   <ClockAlert size={19} aria-hidden="true"/>
   <h2 id={heading}>המשימות שלך שדורשות תשומת לב</h2>
   <button type="button" className="icon-button" aria-label="סגירת תזכורת משימות" onClick={swipe.commit}><X size={18} aria-hidden="true"/></button>
  </div>
  <div className="open-due-reminder-body">
   <TaskList title="באיחור" tasks={overdue}/>
   <TaskList title="להיום או למחר" tasks={soon}/>
  </div>
 </section></div></div>;
}
