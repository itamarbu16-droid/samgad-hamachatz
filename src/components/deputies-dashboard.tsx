"use client";

import { CheckCheck, ClipboardCheck, FileText, Folder, Send } from 'lucide-react';
import {WeeklySchedule} from "./weekly-schedule";
import { taskTone } from '@/lib/task-display';
import { currentMonth, useRhythm } from './use-rhythm';

type Props = {
  pinnedTaskKeys?:string[];
  user: { id: string; name: string };
  tasks: { id: string; title: string; ownerId: string; status: string; dueDate: string | null }[];
  today: string;
  go: (view: string, filter?: string, domain?: string, task?: string) => void;
};

export default function DeputiesDashboard({ user, tasks, today, go,pinnedTaskKeys=[] }: Props) {
  const { data, error, load } = useRhythm(currentMonth());
  const assigned = tasks.filter(task => task.ownerId === user.id && task.status !== 'cancelled');
  const rows = [
    ...assigned.map(task => ({ id: task.id, pinned:pinnedTaskKeys.includes("task:"+task.id), title: task.title, due: task.dueDate, done: task.status === 'completed', pending: task.status === 'pending_review', href: `/deputies?view=tasks&task=${encodeURIComponent(task.id)}` })),
    ...(data?.occurrences.flatMap(occurrence => {
      const item = data.items.find(item => item.id === occurrence.itemId);
      if (!item || item.archived || item.category === 'point' || !item.assigneeIds.includes(user.id)) return [];
      const done = item.completionMode === 'shared' ? Boolean(occurrence.completedAt) : Boolean(occurrence.completions[user.id]);
      return [{ id: occurrence.id, pinned:pinnedTaskKeys.includes("rhythm:"+item.id), title: item.title, due: item.hasDeadline ? occurrence.dueDate : null, done, pending: !done && Boolean(occurrence.reports[user.id]), href: `/deputies?view=tasks&occurrence=${encodeURIComponent(occurrence.id)}` }];
    }) || []),
  ];
  function openTasks(filter = 'all') {
    go('tasks', filter);
    const url = new URL(location.href);
    url.searchParams.set('rhythmFilter', filter === 'pending_review' ? 'pending' : filter === 'active' ? 'open' : filter);
    history.replaceState({}, '', url);
  }
  const pending = rows.filter(row => row.pending).length;
  const overdue = rows.filter(row => !row.done && row.due && row.due < today).length;
  const upcoming = [...rows].filter(row => !row.done && !row.pending).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')||Number(b.pinned)-Number(a.pinned)).slice(0, 5);
  const tiles = [
    { title: 'המשימות שלי', icon: ClipboardCheck, view: 'tasks' },
    { title: 'ספרייה', icon: Folder, view: 'library' },
    { title: 'סיכומי ישיבות', icon: FileText, view: 'records' },
  ];
  return <div className="command-dashboard deputies-dashboard workspace-overview">
    <section className="command-snapshot"><h2>תמונת המצב שלי</h2><div className="command-stats">
      {[{ count: rows.filter(row => !row.done && !row.pending).length, label: 'לביצוע', tone: 'total', filter: 'actionable' }, { count: pending, label: 'לאישור מנהל', tone: 'orange', filter: 'pending_review' }, { count: rows.filter(row => row.done).length, label: 'אושרו', tone: 'green', filter: 'completed' }, { count: overdue, label: 'באיחור', tone: 'red', filter: 'overdue' }].map(stat => <button className={stat.tone} key={stat.label} onClick={() => openTasks(stat.filter)}><strong>{data ? stat.count : "…"}</strong><span>{stat.label}</span></button>)}
    </div><small className="snapshot-note">המשימות שלך ושעל״ח החודש</small></section>
    <nav className="command-tiles command-shortcuts" aria-label="קיצורים">{tiles.map(tile => <button type="button" className="command-tile" key={tile.view} onClick={() => go(tile.view)}><tile.icon size={23} aria-hidden="true" /><strong>{tile.title}</strong></button>)}</nav>
    <section className="command-panel"><div className="command-panel-heading"><h2>משימות קרובות</h2><button onClick={() => go('tasks')}>הצג הכל</button></div>
      {!data&&!error&&<p role="status">טוענים משימות נוספות…</p>}{error && <p role="alert">מוצג מידע חלקי. {error} <button className="button secondary" onClick={()=>void load()}>נסה שוב</button></p>}
      {upcoming.map(row => <a className={`command-task ${taskTone(row.done, row.due, today)}`} href={row.href} key={row.id}><div><strong>{row.pinned?"📌 ":""}{row.title}</strong><span>{row.pending ? 'דווח שבוצע · ממתין לאישור מנהל' : 'ממתין לביצוע'}</span></div><time>{row.due ? new Date(row.due + 'T12:00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : 'ללא מועד'}</time><i /></a>)}
      {!upcoming.length && data && <p className="empty"><CheckCheck size={22} />אין משימות שממתינות לביצוע</p>}
    {pending>0&&<button className="button secondary" onClick={()=>openTasks("pending_review")}>{pending} דיווחים ממתינים לאישור המנהל</button>}</section>
    <WeeklySchedule/>
    <p className="deputies-review-note"><Send size={18} aria-hidden="true" />דיווחים על ביצוע נשלחים לאישור.</p>
  </div>;
}
