"use client";


import {RhythmGantt} from "./rhythm-gantt";
import {WeeklySchedule} from "./weekly-schedule";
import { useState, useEffect } from "react";
import { Plus, CheckCheck, CalendarDays, Users, NotebookPen } from "lucide-react";
import { isPersonalItem } from "@/lib/unit-roles";
import { hasPendingReport,matchesTaskFilter,taskTone,compareTasks,taskSorts,type TaskSort } from "@/lib/task-display";
import { frequencies } from "@/lib/rhythm";
import {TaskFilters} from "./task-filters";
import {TaskActions,SwipeTaskRow} from "./task-actions";
import { Modal, Empty } from "./workspace-primitives";
import { TaskComposer, type Item, type Occurrence } from "./task-composer";
import { useRhythm, useTaskMutations, currentMonth } from "./use-rhythm";
import TaskSnapshot from "./task-snapshot";
export default function PersonalRhythm({
  userId,
  role,
  legacyTasks = [],
  scope = "personal",
  canMoveToPersonal = false,
  manageRhythm = scope === "personal"
}: {
  userId: string;
  role: string;
  legacyTasks?: {status:string;dueDate:string|null}[];
  scope?: "personal" | "assigned";
  manageRhythm?: boolean;
  canMoveToPersonal?: boolean;
}) {
  const [month, setMonth] = useState(currentMonth),
    [tab, setTab] = useState("tasks"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [sort,setSort]=useState<TaskSort>("deadline_asc"),[frequency,setFrequency]=useState("all"),[rhythmLayout,setRhythmLayout]=useState("gantt");
  const [modal, setModal] = useState(""),
    [editing, setEditing] = useState<Item>(),
    [selection, setSelection] = useState<string[]>([]),
    [bulkOwner, setBulkOwner] = useState("");
  const {
      data,
      error,
      load
    } = useRhythm(month),
    actions = useTaskMutations(load);
  const manager = ["deputy", "staff", "company_commander"].includes(role),
    canWrite = manager || role === "contributor";
  function updateView(patch:Record<string,string>) {
    const params = new URLSearchParams(location.search);
    for (const [key,value] of Object.entries(patch)) { if(value) params.set(key,value); else params.delete(key); }
    params.delete('rhythmFilter');
    history.replaceState({},'',location.pathname+(params.size?'?'+params:''));
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(location.search);
      const current = params.get('filter') || params.get('rhythmFilter') || 'all';
      setFilter(current==='pending_review'?'pending':current==='active'?'open':current);
      setQuery(params.get('q') || '');
      const nextSort=params.get('sort') || 'deadline_asc';
      if(Object.hasOwn(taskSorts,nextSort)) setSort(nextSort as TaskSort);
      const nextTab=params.get('tab') || 'tasks';
      if(['tasks',...(manageRhythm?['all','rhythm',...(scope==='personal'?['points']:manager?['groups']:[])]:[])].includes(nextTab)) setTab(nextTab);
      const nextMonth=params.get('month');
      if(nextMonth && /^\d{4}-\d{2}$/.test(nextMonth)) setMonth(nextMonth);
    };
    sync(); window.addEventListener('popstate',sync);
    return () => window.removeEventListener('popstate',sync);
  }, [manageRhythm,scope,manager]);
  useEffect(() => {
    const rollover = () => { if (!new URLSearchParams(location.search).has('month')) setMonth(currentMonth()); };
    const timer = setInterval(rollover, 60000);
    document.addEventListener('visibilitychange', rollover);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', rollover); };
  }, []);
  useEffect(() => {
    if (!data) return;
    const id = new URLSearchParams(window.location.search).get("occurrence");
    if (id) {
      const timer = setTimeout(() => document.getElementById(`occurrence-${id}`)?.scrollIntoView({
        block: "center"
      }), 0);
      return () => clearTimeout(timer);
    }
  }, [data, filter]);
  if (!data) return <section className="panel"><p>{error || "טוענים…"}</p><button className="button secondary" onClick={() => void load()}>רענון</button></section>;
  const person = (id: string) => data.people.find(p => p.id === id)?.name || "בעל תפקיד";
  const records = data.occurrences.map(occurrence => ({
    occurrence,
    item: data.items.find(i => i.id === occurrence.itemId)!
  })).filter(({
    item
  }) => item && (scope === "personal" ? isPersonalItem(item, userId) : !manageRhythm || !isPersonalItem(item, userId)));
  const active = records.filter(({
    item,
    occurrence
  }) => !item.archived && item.category !== "point" && !occurrence.done);
  const visible = records.filter(({
    item,
    occurrence
  }) => {
    if (item.archived || (tab === "points" ? item.category !== "point" : item.category === "point")) return false;
    if (tab === "tasks" && manageRhythm && item.frequency !== "once") return false;
    if (tab === "rhythm" && (item.frequency === "once" || !occurrence.dueDate.startsWith(month) || frequency !== "all" && item.frequency !== frequency)) return false;
    if (query && !`${item.title} ${item.description} ${item.assigneeIds.map(person).join(" ")}`.toLowerCase().includes(query.toLowerCase())) return false;
    return matchesTaskFilter({done:occurrence.done,pending:hasPendingReport(occurrence.reports,occurrence.completions,scope==="assigned"&&!manageRhythm?userId:undefined),dueDate:item.hasDeadline?occurrence.dueDate:null,urgent:occurrence.urgent,important:item.important,assigneeIds:item.assigneeIds,creatorId:item.creatorId},filter,data.today,userId);
  }).sort((a,b)=>compareTasks({id:a.occurrence.id,title:a.item.title,done:a.occurrence.done,pinned:data.pinnedTaskKeys?.includes("rhythm:"+a.item.id),dueDate:a.item.hasDeadline?a.occurrence.dueDate:null},{id:b.occurrence.id,title:b.item.title,done:b.occurrence.done,pinned:data.pinnedTaskKeys?.includes("rhythm:"+b.item.id),dueDate:b.item.hasDeadline?b.occurrence.dueDate:null},sort));
  const patch = (item: Item, body: Record<string, unknown>) => ({
    url: `/api/rhythm/items/${item.id}`,
    method: "PATCH",
    body: {
      version: item.version,
      ...body
    }
  });
  const complete = (row: Occurrence, recipientId: string, done: boolean, review?: string, version = row.version) => ({
    url: `/api/rhythm/occurrences/${row.id}`,
    method: "PATCH",
    body: {
      version,
      recipientId,
      done,
      ...(review ? {
        review
      } : {})
    }
  });
  async function batch(kind: "done" | "approve" | "assign") {
    if (!data) return;
    const ops: {
      url: string;
      method: string;
      body: Record<string, unknown>;
    }[] = [];
    const seen = new Set<string>();
    for (const {
      item,
      occurrence
    } of visible.filter(r => selection.includes(r.occurrence.id))) {
      if (kind === "assign") {
        if ((manager || item.creatorId === userId) && !seen.has(item.id) && bulkOwner) {
          ops.push(patch(item, {
            recipientIds: [bulkOwner]
          }));
          seen.add(item.id);
        }
        continue;
      }
      const ids = item.assigneeIds.filter(id => kind === "approve" ? manager && occurrence.reports[id] && !occurrence.completions[id] : (id === userId || manager) && !occurrence.completions[id] && !occurrence.reports[id]);
      if (ids.length) ops.push({
        url: `/api/rhythm/occurrences/${occurrence.id}`,
        method: "PATCH",
        body: {
          version: occurrence.version,
          recipientIds: ids,
          done: true,
          ...(kind === "approve" ? {
            review: "approve"
          } : {})
        }
      });
    }
    if (ops.length && (await actions.run(ops))) setSelection([]);
  }
  const pendingCount = active.filter(({
    item,
    occurrence
  }) => item.creatorId === userId && Object.keys(occurrence.reports).some(id => !occurrence.completions[id])).length;
  return <div className="rhythm-workspace">
    {scope==="personal" && <TaskSnapshot today={data.today} tasks={[
      ...records.filter(r=>!r.item.archived&&r.item.category!=="point").map(r=>({done:r.occurrence.done,dueDate:r.item.hasDeadline?r.occurrence.dueDate:null})),
      ...legacyTasks.filter(t=>t.status!=="cancelled").map(t=>({done:t.status==="completed",dueDate:t.dueDate}))
    ]} onFilter={filter=>updateView({tab:"all",filter})}/>}
    <div className="rhythm-tabs" role="group" aria-label="תצוגת המרחב האישי">
      {[["tasks", scope === "personal" ? "משימות אישיות עם תג״ב" : "שיוכים וביצוע", CheckCheck], ...(manageRhythm ? [["all", "כל המשימות", CheckCheck], ["rhythm", "שעל״ח — שעון לחימה", CalendarDays]] : []), ...(scope === "personal" ? [["points", "נקודות לעיסוק", NotebookPen]] : manageRhythm && manager ? [["groups", "בעלי תפקידים וקבוצות", Users]] : [])].map(([id, label, Icon]) => {
        const I = Icon as typeof Plus;
        return <button key={String(id)} className={tab === id ? "button primary" : "button secondary"} onClick={() => {
          updateView({tab:String(id),filter:"all"});
          setSelection([]);
        }}><I size={17} />{String(label)}</button>;
      })}
    </div>
    {tab === "rhythm" && <div className="rhythm-tabs"><button className={rhythmLayout==="gantt"?"button primary":"button secondary"} onClick={()=>setRhythmLayout("gantt")}>טבלת גאנט</button><button className={rhythmLayout==="list"?"button primary":"button secondary"} onClick={()=>setRhythmLayout("list")}>עריכת משימות ברשימה</button></div>}
    {tab === "rhythm" && <div className="frequency-tabs" role="group" aria-label="תדירות שעל״ח"><button type="button" aria-pressed={frequency==="all"} className={frequency==="all"?"button primary":"button secondary"} onClick={()=>setFrequency("all")}>כל התדירויות</button>{Object.entries(frequencies).filter(([id])=>id!=="once").map(([id,label])=><button type="button" key={id} aria-pressed={frequency===id} className={frequency===id?"button primary":"button secondary"} onClick={()=>setFrequency(id)}>{label}</button>)}</div>}
    {tab === "tasks" && <p className="rhythm-info">{manageRhythm ? "משימות חד־פעמיות שהוספת. תג״ב הוא לבחירתך; המשימות החוזרות נמצאות בנפרד בשעל״ח." : "המשימות שלך במקום אחד. סימון ביצוע מועבר לאישור המנהל."}</p>}
    <p className="task-swipe-help">החלק ימינה: הצמדה או מחיקה · החלק שמאלה: תג״ב או יומן · כל הפעולות גם בכפתור ⋯</p>
    {scope!=="personal" && <div className="rhythm-summary"><span><strong>{active.length}</strong> פתוחות</span><span className="late"><strong>{active.filter(r => r.occurrence.urgent).length}</strong> דחופות</span>{pendingCount > 0 && <button className="button secondary" onClick={() => {
        updateView({tab:manageRhythm?"all":"tasks",filter:"pending_review"});
      }}>ממתינים לאישור שלך · {pendingCount}</button>}</div>}
    {(error || actions.error) && <p role="alert" className="error-banner">{actions.error || error}</p>}
    {actions.notice && <p role="status" className="rhythm-notice">{actions.notice} {actions.undo.length > 0 && <button disabled={actions.busy} onClick={() => void actions.cancel()}>ביטול פעולה</button>}</p>}
    {tab === "groups" ? <>
      <WeeklySchedule groups={data.groups}/>
      <button className="button primary" onClick={() => setModal("group")}><Plus size={16} /> הוספת קבוצה</button>
      <div className="rhythm-group-grid">{data.groups.map(group => <section className="panel" key={`${group.id}:${group.version}`}><h3>{group.name}</h3><form onSubmit={async event => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            await actions.run([{
              url: `/api/rhythm/groups/${group.id}`,
              method: "PATCH",
              body: {
                name: String(f.get("name")),
                emails: f.getAll("members"),
                version: group.version
              }
            }]);
          }}><label>שם<input name="name" required defaultValue={group.name} /></label><fieldset className="role-chips"><legend>חברי הקבוצה</legend>{data.people.map(p => <label key={p.id}><input name="members" value={p.email} type="checkbox" defaultChecked={group.emails.includes(p.email)} /> {p.name}</label>)}</fieldset><button className="button secondary" disabled={actions.busy}>שמירה</button></form><button className="button secondary" disabled={actions.busy} onClick={async()=>{if(window.confirm(`למחוק את הקבוצה ${group.name}? המשימות הקיימות יישמרו.`))await actions.run([{url:`/api/rhythm/groups/${group.id}`,method:'DELETE',body:{version:group.version}}]);}}>מחיקת קבוצה</button></section>)}</div>
    </> : <>
      <TaskFilters archived={filter==="completed"} onArchive={()=>updateView({filter:filter==="completed"?"all":"completed"})} count={visible.length} active={filter!=="all"||sort!=="deadline_asc"} search={<label>חיפוש<input value={query} onChange={e => updateView({q:e.target.value})} placeholder="חיפוש משימה או בעל תפקיד…" /></label>}>
        <label>סינון<select value={filter} onChange={e => updateView({filter:e.target.value==="pending"?"pending_review":e.target.value==="open"?"active":e.target.value})} aria-label="סינון">{Object.entries({
              open: "פתוחות",
              actionable: "לביצוע",
              all: "הכול",
              pending: "ממתינים לאישור",
              today: "להיום",
              due_soon: "דחוף",
              tomorrow: "מחר",
              overdue: "באיחור",
              urgent: "דחופות",
              important: "חשובות",
              completed: "ארכיון משימות שבוצעו",
              mine: "המשימות שלי",
              assigned: "הוקצו על ידי"
            }).map(([id, label]) => <option key={id} value={id==="pending"?"pending_review":id==="open"?"active":id}>{label}</option>)}</select></label>
        <label>מיון<select aria-label="מיון משימות" value={sort} onChange={e=>updateView({sort:e.target.value})}>{Object.entries(taskSorts).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
        {tab === "rhythm" && <label>חודש<input type="month" value={month} onChange={e => updateView({month:e.target.value})} /></label>}
      </TaskFilters>
      <div className="rhythm-create-action">        {canWrite && (manager || scope==="personal") && <button className="button primary" onClick={() => {
          setEditing(undefined);
          setModal(tab === "points" ? "point" : "create");
        }}><Plus size={17} />{tab === "points" ? "הוספת נקודה" : "הוספת משימה"}</button>}
      </div>
      {tab === "points" && <p className="rhythm-info">מקום פרטי לנושאים שתרצה לקדם. אפשר להוסיף נקודה בלי מועד, ובהמשך להפוך אותה למשימה ולבחור אחראי.</p>}
      {selection.length > 0 && canWrite && <div className="bulk-toolbar" role="group" aria-label="פעולות על משימות נבחרות"><strong>{selection.length} נבחרו</strong><button className="button primary" disabled={actions.busy} onClick={() => void batch("done")}>סימון בוצע</button>{manager && <><button className="button secondary" disabled={actions.busy} onClick={() => void batch("approve")}>אישור דיווחים</button><select aria-label="אחראי למשימות הנבחרות" value={bulkOwner} onChange={e => setBulkOwner(e.target.value)}><option value="">בחירת אחראי</option>{data.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="button secondary" disabled={actions.busy || !bulkOwner} onClick={() => void batch("assign")}>שינוי אחראי</button></>}<button className="button secondary" onClick={() => setSelection([])}>ניקוי בחירה</button></div>}
      {tab === "rhythm" && rhythmLayout === "gantt" ? <RhythmGantt items={data.items.filter(item=>(scope==="personal"?isPersonalItem(item,userId):!isPersonalItem(item,userId))&&(frequency==="all"||item.frequency===frequency)&&(!query||`${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())))} occurrences={data.occurrences} month={month} today={data.today} filter={filter} canWrite={canWrite} busy={actions.busy} onEdit={item=>{setEditing(item);setModal("create");}} onToggle={(item,row)=>void actions.run([{url:`/api/rhythm/occurrences/${row.id}`,method:"PATCH",body:{version:row.version,recipientIds:item.assigneeIds,done:!row.done}}])}/> : <section className="rhythm-card-list" aria-label="רשימת משימות"><div className="rhythm-list-heading">{tab === "points" ? "נקודות לעיסוק" : tab === "rhythm" ? `שעון לחימה — ${month}` : "משימות וביצוע"}{canWrite && <label className="rhythm-select-all"><input type="checkbox" aria-label="בחירת כל המשימות המוצגות" checked={visible.length > 0 && visible.every(r => selection.includes(r.occurrence.id))} onChange={e => setSelection(e.target.checked ? visible.filter(r=>manager || r.item.assigneeIds.includes(userId)).map(r => r.occurrence.id) : [])} /><span>בחירת הכול</span></label>}</div><div className="rhythm-cards">
        {visible.map(({
              item,
              occurrence
            }) => <SwipeTaskRow canExtendDirectly={role==="deputy"} task={{kind:"rhythm",id:item.id,occurrenceId:occurrence.id}} title={item.title} pinned={Boolean(data.pinnedTaskKeys?.includes("rhythm:"+item.id))} canEdit={canWrite&&(manager||item.assigneeIds.includes(userId))} canDelete={canWrite&&(manager||item.creatorId===userId)} id={`occurrence-${occurrence.id}`} key={occurrence.id} className={`rhythm-task-card ${taskTone(occurrence.done,item.hasDeadline?occurrence.dueDate:null,data.today)}`}>
          <div className="rhythm-task-selection">{canWrite && (manager || item.assigneeIds.includes(userId)) && <label className="task-select-touch"><input type="checkbox" aria-label={`בחירת ${item.title}`} checked={selection.includes(occurrence.id)} onChange={e => setSelection(ids => e.target.checked ? [...ids, occurrence.id] : ids.filter(id => id !== occurrence.id))} /></label>}</div>
          <div className="rhythm-task-content"><strong>{data.pinnedTaskKeys?.includes("rhythm:"+item.id)&&<span className="task-pin-label">📌 מוצמדת · </span>}{item.title}</strong>{item.description && <small>{item.description}</small>}<small>{isPersonalItem(item, userId) ? "אישי — משותף לבעלי הרשאת עריכה מלאה" : `הוקצה על ידי ${person(item.creatorId)}`}{item.frequency !== "once" ? ` · ${frequencies[item.frequency]}` : ""}</small>{item.important && <span className="badge high">חשוב</span>}{occurrence.urgent && <span className="badge urgent">דחוף</span>}</div>
          <div className="rhythm-task-deadline"><span className="deadline-label">תג״ב: </span>{item.hasDeadline && item.category !== "point" ? new Date(occurrence.dueDate + "T12:00:00Z").toLocaleDateString("he-IL") : "ללא מועד"}{item.hasDeadline && occurrence.dueDate < data.today && !occurrence.done && <small className="late">באיחור</small>}</div>
          <div className="rhythm-task-completion">{item.assigneeIds.map(id => {
                  const approved = Boolean(occurrence.completions[id]) || item.completionMode === "shared" && Boolean(occurrence.completedAt);
                  const pending = Boolean(occurrence.reports[id]) && !approved;
                  return <div className="completion-controls" key={id}><span>{item.assigneeIds.length > 1 || !isPersonalItem(item, userId) ? `${person(id)} · ` : ""}{approved ? "בוצע" : pending ? "ממתין לאישור" : "לא בוצע"}</span>{canWrite && (id === userId || manager) && <button className={approved || pending ? "button secondary" : "button primary"} disabled={actions.busy} aria-label={`${approved || pending ? "לא בוצע" : "בוצע"}: ${item.title} ${person(id)}`} onClick={() => void actions.run([complete(occurrence, id, !(approved || pending))])}>{approved || pending ? "לא בוצע" : "בוצע"}</button>}{pending && manager && canWrite && <><button className="button primary" disabled={actions.busy} onClick={() => void actions.run([complete(occurrence, id, true, "approve")])}>אשר</button><button className="button secondary" disabled={actions.busy} onClick={() => void actions.run([complete(occurrence, id, false, "reject")])}>החזר לטיפול</button></>}</div>;
                })}</div>
          <div className="rhythm-task-management"><TaskActions canMoveToPersonal={scope!=="personal"&&canMoveToPersonal&&!isPersonalItem(item,userId)} canExtendDirectly={role==="deputy"} task={{kind:"rhythm",id:item.id,occurrenceId:occurrence.id}} title={item.title} version={item.version} occurrenceVersion={occurrence.version} dueDate={item.hasDeadline?occurrence.dueDate:null} pinned={Boolean(data.pinnedTaskKeys?.includes("rhythm:"+item.id))} canEdit={canWrite&&(manager||item.assigneeIds.includes(userId))} canDelete={canWrite&&(manager||item.creatorId===userId)} recurring={item.frequency!=="once"} onSaved={load}>{(manager || item.assigneeIds.includes(userId)) && canWrite && <div className="completion-controls"><button className="button secondary" onClick={() => {
                    setEditing(item);
                    setModal(item.category === "point" ? "point" : "edit");
                  }}>עריכה</button>{item.category === "point" && <button className="button primary" onClick={() => {
                    setEditing(item);
                    setModal("convert");
                  }}>הפיכה למשימה</button>}{(manager||item.creatorId===userId)&&<button className="button secondary" disabled={actions.busy} onClick={() => void actions.run([patch(item, {
                    archived: true
                  })])}>ארכוב</button>}</div>}</TaskActions></div>
        </SwipeTaskRow>)}
      </div>{!visible.length && <Empty>אין פריטים בתצוגה הזו. אפשר להוסיף חדש או לשנות סינון.</Empty>}</section>}
      {canWrite && <details><summary>ארכיון</summary>{data.items.filter(item => item.archived && (scope === "personal" ? isPersonalItem(item, userId) : !manageRhythm || !isPersonalItem(item, userId)) && item.creatorId === userId).map(item => <p key={item.id}>{item.title} <button className="button secondary" disabled={actions.busy} onClick={() => void actions.run([patch(item, {
            archived: false
          })])}>שחזור</button></p>)}</details>}
    </>}
    {modal && <Modal title={modal === "group" ? "הוספת קבוצה" : modal === "convert" ? "הפיכת נקודה למשימה" : modal === "point" ? "נקודה לעיסוק" : editing ? "עריכת משימה" : "משימה"} close={() => setModal("")}>
      {actions.error && <p role="alert" className="error-banner">{actions.error}</p>}
      {modal === "group" ? <form onSubmit={async event => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        if (await actions.run([{
          url: "/api/rhythm/groups",
          method: "POST",
          body: {
            name: String(f.get("name")),
            emails: f.getAll("members")
          }
        }])) setModal("");
      }}><label>שם הקבוצה<input name="name" required minLength={2} /></label><fieldset><legend>חברים</legend>{data.people.map(p => <label key={p.id}><input type="checkbox" name="members" value={p.email} /> {p.name}</label>)}</fieldset><button className="button primary" disabled={actions.busy}>שמירה</button></form> : <TaskComposer key={editing?.id || modal} data={data} userId={userId} role={role} item={editing} point={modal === "point"} convert={modal === "convert"} recurring={tab === "rhythm"} busy={actions.busy} onSave={async body => {
        const ok = await actions.run([{
          url: editing ? `/api/rhythm/items/${editing.id}` : "/api/rhythm/items",
          method: editing ? "PATCH" : "POST",
          body:editing?body:{...body,personal:scope==="personal"}
        }]);
        if (ok) {
          setModal("");
          setFilter("all");
        }
        return ok;
      }} />}
    </Modal>}
  </div>;
}
