"use client";
import { taskTone } from "@/lib/task-display";
import { apiFetch } from "@/lib/offline";

import { useState, useEffect, useRef } from "react";
import { Plus, Search } from "lucide-react";
import { Modal, Empty } from "./workspace-primitives";
import { TaskComposer } from "./task-composer";
import { currentMonth, useRhythm, useTaskMutations } from "./use-rhythm";
type Task = {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  ownerId: string;
  status: string;
  dueDate: string | null;
  version: number;
};
type SearchResult = {
  id: string;
  title: string;
  kind: string;
  href: string;
};
export default function TaskTools({
  userId,
  role,
  tasks,
  dashboard,
  personalAllowed=false,
  onSaved
}: {
  userId: string;
  role: string;
  tasks: Task[];
  dashboard: boolean;
  personalAllowed?:boolean;
  onSaved: () => Promise<void>;
}) {
  const [month] = useState(currentMonth),
    {
      data,
      error,
      load
    } = useRhythm(month);
  const [modal, setModal] = useState(""),
    [mode, setMode] = useState("task"),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<SearchResult[]>([]),
    [searched, setSearched] = useState(false),
    [searchError, setSearchError] = useState(""),
    [searchBusy, setSearchBusy] = useState(false);
  const searchSequence = useRef(0);
  const reload = async () => {
    await Promise.all([load(), onSaved()]);
  };
  const actions = useTaskMutations(reload);
  const manager=["deputy","staff"].includes(role);
  const canWrite = ["deputy", "staff", "company_commander", "contributor"].includes(role);
  const rows = data?.occurrences.map(occurrence => ({
    occurrence,
    item: data.items.find(item => item.id === occurrence.itemId)!
  })).filter(row => row.item && !row.item.archived && row.item.category !== "point") || [];
  const pendingRows = rows.filter(({
    item,
    occurrence
  }) => manager && !occurrence.done && item.assigneeIds.some(id => occurrence.reports[id] && !occurrence.completions[id]));
  const todayRows = rows.filter(({
    item,
    occurrence
  }) => item.hasDeadline && !occurrence.done && occurrence.dueDate === data?.today);
  const lateRows = rows.filter(({
    item,
    occurrence
  }) => item.hasDeadline && !occurrence.done && occurrence.dueDate < (data?.today || ""));
  const legacyPending = tasks.filter(t => manager && t.status === "pending_review"),
    legacyToday = tasks.filter(t => t.dueDate === data?.today && !["completed", "cancelled"].includes(t.status)),
    legacyLate = tasks.filter(t => t.dueDate && t.dueDate < (data?.today || "") && !["completed", "cancelled"].includes(t.status));
  const list = modal === "pending" ? pendingRows : modal === "today" ? todayRows : lateRows;
  const legacy = modal === "pending" ? legacyPending : modal === "today" ? legacyToday : legacyLate;
  async function search(event: React.FormEvent) {
    event.preventDefault();
    const seq = ++searchSequence.current;
    setSearchBusy(true);
    setSearchError("");
    setSearched(false);
    try {
      const r = await apiFetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
        cache: "no-store"
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "החיפוש נכשל");
      if (seq === searchSequence.current) {
        setResults(j.results);
        setSearched(true);
      }
    } catch (e) {
      if (seq === searchSequence.current) setSearchError(e instanceof Error ? e.message : "החיפוש נכשל");
    } finally {
      if (seq === searchSequence.current) setSearchBusy(false);
    }
  }
  useEffect(() => {
    const capture = () => {
      setMode("task");
      setModal("capture");
    };
    window.addEventListener("samgad:capture", capture);
    return () => {
      searchSequence.current++;
      window.removeEventListener("samgad:capture", capture);
    };
  }, []);
  return <>
    <div className="global-task-bar"><button className="button secondary" onClick={() => setModal("search")}><Search size={17} />חיפוש בכל האפליקציה</button></div>
    {dashboard && <section className="focus-hub" aria-label="מה דורש ממך פעולה">
      {[{
        id: "pending",
        label: "ממתינים לאישורך",
        count: pendingRows.length + legacyPending.length
      }, {
        id: "today",
        label: "משימות להיום",
        count: todayRows.length + legacyToday.length
      }, {
        id: "overdue",
        label: "משימות באיחור",
        count: lateRows.length + legacyLate.length
      }].map(card => <button key={card.id} className="panel focus-card" onClick={() => setModal(card.id)}><strong>{data ? card.count : "…"}</strong><span>{card.label}</span></button>)}
    </section>}
    {["deputy","staff"].includes(role) && <button className="capture-button" aria-label="הוספה מהירה" onClick={() => {
      setMode("task");
      setModal("capture");
    }}><Plus size={24} /><span>הוספה</span></button>}
    {actions.notice && <div role="status" className="quick-notice">{actions.notice}{actions.undo.length > 0 && <button disabled={actions.busy} onClick={() => void actions.cancel()}>ביטול פעולה</button>}</div>}
    {modal && <Modal title={modal === "capture" ? "הוספה מהירה" : modal === "search" ? "חיפוש בכל האפליקציה" : modal === "pending" ? "ממתינים לאישורך" : modal === "today" ? "משימות להיום" : "משימות באיחור"} close={() => {
      setModal("");
      searchSequence.current++;
    }} wide={modal !== "capture"}>
      {(error || actions.error) && <p className="error-banner" role="alert">{actions.error || error}</p>}
      {modal === "capture" ? <>
        <div className="rhythm-tabs"><button className={mode === "task" ? "button primary" : "button secondary"} onClick={() => setMode("task")}>משימה</button>{personalAllowed && <button className={mode === "point" ? "button primary" : "button secondary"} onClick={() => setMode("point")}>נקודה לעיסוק</button>}</div>
        {data ? <TaskComposer key={mode} data={data} userId={userId} role={role} point={personalAllowed && mode === "point"} busy={actions.busy} onSave={async body => {
          const ok = await actions.run([{
            url: "/api/rhythm/items",
            method: "POST",
            body
          }]);
          if (ok) setModal("");
          return ok;
        }} /> : <p>טוענים…</p>}
      </> : modal === "search" ? <>
        <form onSubmit={search} className="rhythm-toolbar"><label>מה לחפש?<input type="search" required maxLength={200} value={query} onChange={e => {
              setQuery(e.target.value);
              setSearched(false);
            }} placeholder="משימה, נקודה, מסמך או סיכום" /></label><button className="button primary" disabled={searchBusy || !query.trim()}>חיפוש</button></form>
        {searchError && <p role="alert">{searchError}</p>}{searched && !results.length && <Empty>לא נמצאו תוצאות.</Empty>}
        <div className="search-results">{results.map(result => <a key={result.kind + result.id} href={result.href} className="panel"><small>{result.kind}</small><strong>{result.title}</strong></a>)}</div>
      </> : <>
        {list.map(({
          item,
          occurrence
        }) => <section className={`panel focus-task ${taskTone(occurrence.done,item.hasDeadline?occurrence.dueDate:null,data?.today || "")}`} key={occurrence.id}><h3>{item.title}</h3><a href={`/?view=${item.assigneeIds.length === 1 && item.assigneeIds[0] === item.creatorId ? "personal" : "tasks"}&rhythmFilter=all&occurrence=${encodeURIComponent(occurrence.id)}`}>פתיחת המשימה</a>
          {canWrite && item.assigneeIds.map(id => {
            const pending = occurrence.reports[id] && !occurrence.completions[id];
            if (modal === "pending" && !pending) return null;
            return <div className="completion-controls" key={id}><span>{data?.people.find(p => p.id === id)?.name}</span>{pending && manager ? <><button className="button primary" disabled={actions.busy} onClick={() => void actions.run([{
                  url: `/api/rhythm/occurrences/${occurrence.id}`,
                  method: "PATCH",
                  body: {
                    version: occurrence.version,
                    recipientId: id,
                    done: true,
                    review: "approve"
                  }
                }])}>אשר</button><button className="button secondary" disabled={actions.busy} onClick={() => void actions.run([{
                  url: `/api/rhythm/occurrences/${occurrence.id}`,
                  method: "PATCH",
                  body: {
                    version: occurrence.version,
                    recipientId: id,
                    done: false,
                    review: "reject"
                  }
                }])}>החזר לטיפול</button></> : id === userId || manager ? <button className="button primary" disabled={actions.busy || Boolean(pending) || Boolean(occurrence.completions[id])} onClick={() => void actions.run([{
                url: `/api/rhythm/occurrences/${occurrence.id}`,
                method: "PATCH",
                body: {
                  version: occurrence.version,
                  recipientId: id,
                  done: true
                }
              }])}>{pending ? "ממתין לאישור" : "בוצע"}</button> : null}</div>;
          })}
        </section>)}
        {legacy.map(task => <section className={`panel focus-task ${taskTone(task.status==="completed",task.dueDate,data?.today || "")}`} key={task.id}><h3>{task.title}</h3><a href={`/?view=tasks&task=${encodeURIComponent(task.id)}`}>פתיחת המשימה</a>{canWrite && (manager || task.ownerId === userId) && <div className="completion-controls"><button className="button primary" disabled={actions.busy} onClick={() => void actions.run([{
              url: `/api/tasks/${task.id}`,
              method: "PATCH",
              body: {
                version: task.version,
                status: manager ? "completed" : "pending_review"
              }
            }])}>{task.status === "pending_review" && manager ? "אשר" : "בוצע"}</button>{task.status === "pending_review" && manager && <button className="button secondary" disabled={actions.busy} onClick={() => void actions.run([{
              url: `/api/tasks/${task.id}`,
              method: "PATCH",
              body: {
                version: task.version,
                status: "in_progress"
              }
            }])}>החזר לטיפול</button>}</div>}</section>)}
        {data && !list.length && !legacy.length && <Empty>אין כרגע משימות ברשימה הזו.</Empty>}
      </>}
    </Modal>}
  </>;
}
