"use client";

import { Bell, CheckCheck, ChevronLeft, ClipboardCheck, FileText, Folder, Send } from 'lucide-react';
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
  const upcoming = [...rows].filter(row => !row.done && !row.pending).sort((a, b) => Number(b.pinned)-Number(a.pinned)||(a.due || '9999').localeCompare(b.due || '9999')).slice(0, 5);
  const tiles = [
    { title: 'המשימות שלי', sub: 'עדכון ביצוע ומעקב', icon: ClipboardCheck, view: 'tasks' },
    { title: 'ספרייה', sub: 'פקודות, נהלים ופורמטים', icon: Folder, view: 'library' },
    { title: 'סיכומי ישיבות', sub: 'סיכומים וביקורות', icon: FileText, view: 'records' },
  ];
  return <div className="command-dashboard deputies-dashboard">
    <header className="command-hero">
      <div className="command-scene" />
      <div className="command-identity"><span className="avatar">{user.name.slice(0, 1)}</span><span>{user.name}</span></div>
      <button className="command-bell icon-button" aria-label="עדכונים אחרונים" onClick={() => go('activity')}><Bell size={24} /></button>
      <div className="battalion-brand"><div className="battalion-crest" role="img" aria-label="סמל גדוד 75" /><h1>סגני רומח</h1><p>כרומח חד אל תוך אדמת אויב</p></div>
    </header>
    <div className="deputies-greeting"><span>מרחב בעלי התפקידים</span><h2>שלום, {user.name}</h2></div>
    <div className="command-tiles">{tiles.map(tile => <button className="command-tile" key={tile.view} onClick={() => go(tile.view)}><tile.icon size={30} strokeWidth={1.6} /><strong>{tile.title}</strong><span>{tile.sub}</span></button>)}</div>
    <section className="command-snapshot"><h2>תמונת המצב שלי</h2><div className="command-stats">
      {[{ count: rows.filter(row => !row.done && !row.pending).length, label: 'לביצוע', tone: 'total', filter: 'actionable' }, { count: pending, label: 'לאישור מנהל', tone: 'orange', filter: 'pending_review' }, { count: rows.filter(row => row.done).length, label: 'אושרו', tone: 'green', filter: 'completed' }, { count: overdue, label: 'באיחור', tone: 'red', filter: 'overdue' }].map(stat => <button className={stat.tone} key={stat.label} onClick={() => openTasks(stat.filter)}><strong>{stat.count}</strong><span>{stat.label}</span></button>)}
    </div><small className="snapshot-note">משימות שהוקצו לך ומשימות החודש</small></section>
    <section className="command-panel"><div className="command-panel-heading"><h2><ChevronLeft size={21} />המשימות הקרובות שלי</h2><button onClick={() => go('tasks')}>הצג הכל</button></div>
      {!data&&!error&&<p role="status">טוענים משימות נוספות…</p>}{error && <p role="alert">מוצג מידע חלקי. {error} <button className="button secondary" onClick={()=>void load()}>נסה שוב</button></p>}
      {upcoming.map(row => <a className={`command-task ${taskTone(row.done, row.due, today)}`} href={row.href} key={row.id}><div><strong>{row.pinned?"📌 ":""}{row.title}</strong><span>{row.pending ? 'דווח שבוצע · ממתין לאישור מנהל' : 'ממתין לביצוע'}</span></div><time>{row.due ? new Date(row.due + 'T12:00:00').toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : 'ללא מועד'}</time><i /></a>)}
      {!upcoming.length && data && <p className="empty"><CheckCheck size={22} />אין משימות שממתינות לביצוע</p>}
    {pending>0&&<button className="button secondary" onClick={()=>openTasks("pending_review")}>{pending} דיווחים ממתינים לאישור המנהל</button>}</section>
    <p className="deputies-review-note"><Send size={18} />מסמנים ביצוע במשימה, והדיווח מועבר לאישור המנהל.</p>
  </div>;
}
