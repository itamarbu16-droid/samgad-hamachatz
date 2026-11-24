"use client";
import ActivityFeed from "./activity-feed";
import {CalendarDays, ClipboardCheck, Folder, FileText, UserRound, ChevronLeft, ShieldCheck} from 'lucide-react';
import {currentMonth,useRhythm} from './use-rhythm';
import HomeTaskPreview from './home-task-preview';
import {taskTone} from '@/lib/task-display';
import {isPersonalItem} from '@/lib/unit-roles';
import {isPersonalTask} from '@/lib/task-snapshot';
import {addDays} from '@/lib/rhythm';
type Props={onActivityChanged?:()=>void|Promise<void>;pinnedTaskKeys?:string[];user:{id:string;workspaceOwnerId?:string;name:string;permissions?:{manageAccess:boolean}},tasks:{id:string;title:string;status:string;dueDate:string|null;ownerId:string;creatorId:string}[],users:{id:string;name:string}[],today:string,activity:{id:string;summary:string;createdAt:string}[],go:(view:string,filter?:string,domain?:string,task?:string)=>void};
export default function CommandDashboard({pinnedTaskKeys=[],user,tasks,users,today,activity,go,onActivityChanged}:Props){
 const {data,error,load}=useRhythm(currentMonth());
 const rows=[...tasks.filter(t=>t.status!=='cancelled'&&!isPersonalTask(t,user.workspaceOwnerId || user.id)).map(t=>({id:t.id,title:t.title,pinned:pinnedTaskKeys.includes('task:'+t.id),done:t.status==='completed',due:t.dueDate,owner:users.find(u=>u.id===t.ownerId)?.name||'',href:`/?view=tasks&task=${encodeURIComponent(t.id)}`})),...(data?.occurrences.flatMap(o=>{const i=data.items.find(i=>i.id===o.itemId);return !i||i.archived||i.category==='point'||isPersonalItem(i,user.workspaceOwnerId || user.id)?[]:[{id:o.id,title:i.title,pinned:pinnedTaskKeys.includes('rhythm:'+i.id),done:o.done,due:i.hasDeadline?o.dueDate:null,owner:i.assigneeIds.map(id=>data.people.find(p=>p.id===id)?.name).filter(Boolean).join(', '),href:`/?view=${i.assigneeIds.length===1&&i.assigneeIds[0]===user.id&&i.creatorId===user.id?'personal':'tasks'}&occurrence=${encodeURIComponent(o.id)}${i.frequency!=='once'?'&tab=rhythm&month='+o.dueDate.slice(0,7):''}`}];})||[])];
 function openTasks(filter='all') {
  go('tasks',filter);
  const url=new URL(location.href);url.searchParams.set('tab','all');
  history.replaceState({},'',url);window.dispatchEvent(new PopStateEvent('popstate'));
 }
 const late=rows.filter(t=>!t.done&&t.due&&t.due<today).length;
 const tomorrow=rows.filter(t=>!t.done&&t.due&&t.due>=today&&t.due<=addDays(today,1)).length;
 const done=rows.filter(t=>t.done).length;
 const upcoming=rows.filter(t=>!t.done).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||Number(b.pinned)-Number(a.pinned));
 const tiles=[{title:'שעל״ח',icon:CalendarDays,view:user.permissions?.manageAccess?'personal':'tasks',tab:'rhythm'}, {title:'משימות',icon:ClipboardCheck,view:'tasks'}, ...(user.permissions?.manageAccess?[{title:'אישי',icon:UserRound,view:'personal'}]:[]), {title:'ספרייה',icon:Folder,view:'library'}, {title:'סיכומי ישיבות',icon:FileText,view:'records'}];
 return <div className="command-dashboard workspace-overview">
  <section className="command-snapshot"><h2>תמונת מצב גדודית</h2><div className="command-stats">{[{n:rows.length,label:'סה״כ',tone:'total',filter:'all'},{n:done,label:'בוצעו',tone:'green',filter:'completed'},{n:tomorrow,label:'בקרוב',tone:'orange',filter:'due_soon'},{n:late,label:'באיחור',tone:'red',filter:'overdue'}].map(s=><button key={s.label} className={s.tone} onClick={()=>openTasks(s.filter)}><strong>{data ? s.n : "…"}</strong><span>{s.label}</span></button>)}</div><small className="snapshot-note">משימות גדודיות + שעל״ח החודש</small>{!data&&!error&&<p role="status">טוענים משימות נוספות…</p>}{error&&<p role="alert">מוצג מידע חלקי. {error} <button className="button secondary" onClick={()=>void load()}>נסה שוב</button></p>}</section>
  <nav className="command-tiles command-shortcuts" aria-label="קיצורים">{tiles.map(t=><button type="button" className="command-tile" key={t.title} onClick={()=>{if(t.tab){history.pushState({},'',`/?view=${t.view}&tab=${t.tab}`);window.dispatchEvent(new PopStateEvent('popstate'));}else go(t.view);}}><t.icon size={23} aria-hidden="true"/><strong>{t.title}</strong></button>)}</nav>
  <section className="command-panel"><div className="command-panel-heading"><h2>משימות קרובות</h2><button onClick={()=>go('tasks')}>הצג הכל</button></div>{upcoming.length?<HomeTaskPreview tasks={upcoming} renderTask={t=><a className={`command-task ${taskTone(t.done,t.due,today)}`} href={t.href} key={t.id}><div><strong>{t.pinned?"📌 ":""}{t.title}</strong><span>{t.owner} · {t.done?"בוצע":t.due&&t.due<today?"באיחור":t.due===today?"להיום":t.due===addDays(today,1)?"דחוף":"לביצוע"}</span></div><time>{t.due?new Date(t.due+'T12:00:00').toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit'}):'ללא מועד'}</time><i/></a>}/>:<p className="empty">{data ? "אין משימות להצגה" : "טוענים משימות…"}</p>}</section>
  <section className="command-panel"><div className="command-panel-heading"><h2>עדכונים</h2><button onClick={()=>go('activity')}>כל העדכונים</button></div><ActivityFeed items={activity.slice(0,2)} onSaved={onActivityChanged}/></section>
  {user.permissions?.manageAccess && <div className="command-access"><button type="button" onClick={()=>go('access')}><ShieldCheck size={22} aria-hidden="true"/><span><strong>ניהול גישה</strong></span><ChevronLeft size={18} aria-hidden="true"/></button><a href="/deputies/login">כניסת סגני המחץ</a></div>}
 </div>
}
