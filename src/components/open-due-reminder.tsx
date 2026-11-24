"use client";

import { useId } from 'react';
import { useRightSwipe } from './home-task-preview';
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
 const heading=useId();
 const swipe=useRightSwipe<HTMLElement>(onDismiss);
 const {overdue,soon}=openDueReminderGroups(props);
 if(!overdue.length&&!soon.length)return null;
 return <section className="open-due-reminder" aria-labelledby={heading} dir="rtl" {...swipe}>
  <div className="open-due-reminder-heading">
   <ClockAlert size={19} aria-hidden="true"/>
   <h2 id={heading}>המשימות שלך שדורשות תשומת לב</h2>
   <button type="button" className="icon-button" aria-label="סגירת תזכורת משימות" onClick={onDismiss}><X size={18} aria-hidden="true"/></button>
  </div>
  <div className="open-due-reminder-body">
   <TaskList title="באיחור" tasks={overdue}/>
   <TaskList title="להיום או למחר" tasks={soon}/>
  </div>
 </section>;
}
