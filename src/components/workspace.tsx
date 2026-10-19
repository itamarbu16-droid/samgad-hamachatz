"use client";
import { apiFetch, clearOffline, offlineStatus } from "@/lib/offline";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { isOverdue, assertTransition, type TaskStatus } from "@/server/policy";
import DocumentLibrary from "./document-library";
import {isPersonalTask} from "@/lib/task-snapshot";
import CommandDashboard from "./command-dashboard";
import DeputiesDashboard from "./deputies-dashboard";
import AccessSettings from "./access-settings";
import {TaskActions,TaskActionNotice,SwipeTaskRow} from "./task-actions";
import {TaskFilters} from "./task-filters";
import {Schedule} from "./schedule";
import { matchesTaskFilter,taskTone,compareTasks,taskSorts,type TaskSort } from "@/lib/task-display";
import {DeadlineRequests} from "./deadline-requests";
import {PushSettings,PushAutoRestore} from "./push-settings";
import PersonalRhythm from "./personal-rhythm";
import TaskTools from "./task-tools";
import {useTaskMutations} from "./use-rhythm";
import { Modal, Empty, PanelHeading } from "./workspace-primitives";
import {
  LayoutDashboard,
  CheckCheck,
  CircleHelp,
  Layers3,
  History,
  Plus,
  Search,
  ArrowLeft,
  X,
  LogOut,
  Check,
  AlertCircle,
  ChevronLeft,
  RefreshCw,
  UserRound,
  CalendarDays,
  LibraryBig,
  NotebookPen,
  Send,
  ShieldCheck,
  LoaderCircle,
  Menu,
  House,
} from "lucide-react";
type Person = { id: string; workspaceOwnerId?:string; name: string; role: string; permissions?: {editAll:boolean;manageAccess:boolean;guest:boolean} };
type Task = {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  creatorId: string;
  domainId: string;
  companyId: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  requiresReview: boolean;
  blockerReason: string | null;
  comments: {
    id: string;
    body: string;
    actorName: string;
    createdAt: string;
  }[];
};
type Decision = {
  id: string;
  title: string;
  description: string;
  domainId: string;
  requesterId: string;
  deciderId: string;
  priority: string;
  status: string;
  notes: string | null;
  taskId: string | null;
  createdAt: string;
  version: number;
};
type Data = {
  user: Person;
  pinnedTaskKeys?: string[];
  tasks: Task[];
  decisions: Decision[];
  domains: { id: string; name: string; color: string }[];
  users: Person[];
  companies: { id: string; name: string }[];
  activity: {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    actorName: string;
    createdAt: string;
    summary: string;
  }[];
  demo: boolean;
  today: string;
};
const statuses: Record<string, string> = {
  open: "לא בוצע",
  in_progress: "בטיפול",
  blocked: "בטיפול",
  pending_review: "ממתין לאישור",
  completed: "בוצע",
  cancelled: "בוטלה",
};
const priorities: Record<string, string> = {
  low: "נמוכה",
  normal: "רגילה",
  high: "גבוהה",
  urgent: "דחופה",
};
const decisionStatuses: Record<string, string> = {
  pending: "ממתינה להחלטה",
  clarification_requested: "נדרש בירור",
  approved: "אושרה",
  rejected: "נדחתה",
};
const nav = [
  ["dashboard", "ראשי", LayoutDashboard],
  ["tasks", "משימות", CheckCheck],
  ["personal", "אישי", UserRound],
  ["library", "ספרייה", LibraryBig],
  ["records", "סיכומי ישיבות וביקורות", NotebookPen],
  ["decisions", "ממתין להחלטה", CircleHelp],
  ["domains", "אחריות", Layers3],
  ["activity", "פעילות אחרונה", History],
  ["calendar", "לו״ז", CalendarDays],
] as const;
const date = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("he-IL", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Jerusalem",
      }).format(new Date(s))
    : "ללא מועד";
function Badge({
  value,
  decision = false,
}: {
  value: string;
  decision?: boolean;
}) {
  return (
    <span className={`badge ${value}`}>
      {(decision ? decisionStatuses : statuses)[value] ||
        priorities[value] ||
        value}
    </span>
  );
}
export default function Workspace() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState("dashboard"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [domain, setDomain] = useState(""),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState(""),
    [refreshed, setRefreshed] = useState("");
  const [sort,setSort]=useState<TaskSort>("deadline_desc");
  const [taskSelection,setTaskSelection]=useState<string[]>([]),[batchOwner,setBatchOwner]=useState("");
  const requestIds = useRef(new Map<string, string>());
  const sync = () => {
    const p = new URLSearchParams(location.search);
    setView(
      p.get("view") === "rhythm" ? "personal" : p.get("view") || "dashboard",
    );
    setFilter(
      ["assigned", "blocked"].includes(p.get("filter") || "")
        ? "all"
        : p.get("filter") || "all",
    );
    setDomain(p.get("domain") || "");
    setSelected(p.get("task") || "");
    setQuery(p.get("q") || "");
    const nextSort=p.get("sort") || "deadline_desc";
    if(Object.hasOwn(taskSorts,nextSort))setSort(nextSort as TaskSort);
  };
  useEffect(() => {
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function go(v: string, f = "all", d = "", task = "", q = "") {
    setTaskSelection([]);
    const p = new URLSearchParams();
    if (v !== "dashboard") p.set("view", v);
    if (f !== "all") p.set("filter", f);
    if (d) p.set("domain", d);
    if (task) p.set("task", task);
    if (q) p.set("q", q);
    if(sort!=="deadline_desc")p.set("sort",sort);
    if(v==="tasks" && location.search.includes("tab=all"))p.set("tab","all");
    history.pushState({}, "", `${(data?.user.permissions?.manageAccess || data?.user.permissions?.editAll) ? "/" : "/deputies"}${p.size ? "?" + p : ""}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  async function load() {
    try {
      const r = await apiFetch("/api/workspace", { cache: "no-store" });
      if (r.status === 401) {
        location.href = location.pathname.startsWith("/deputies") ? "/deputies/login" : "/login";
        return;
      }
      const j = await r.json();
      if (!r.ok) { setData(null); throw Error(j.error || "לא ניתן לטעון את המידע"); }
      const base = (j.user.permissions?.manageAccess || j.user.permissions?.editAll) ? '/' : '/deputies';
      const params = new URLSearchParams(location.search);
      if (!j.user.permissions?.manageAccess && ['personal', 'rhythm', 'access'].includes(params.get('view') || '')) {
        params.delete('view');
        setView('dashboard');
      }
      const destination = base + (params.size ? '?' + params : '');
      if (location.pathname !== base) { location.replace(destination); return; }
      if (location.search !== (params.size ? '?' + params : '')) history.replaceState({}, '', destination);
      setData(j);
      setRefreshed(
        new Date().toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "אירעה שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }
  const taskActions=useTaskMutations(load);
  useEffect(() => { const refresh = () => void load(); const visibleRefresh=()=>{if(document.visibilityState==="visible")refresh();}; const timer=setInterval(visibleRefresh,60000); window.addEventListener("samgad:saved", refresh); document.addEventListener("visibilitychange",visibleRefresh); return () => {clearInterval(timer);window.removeEventListener("samgad:saved", refresh);document.removeEventListener("visibilitychange",visibleRefresh);}; }, []);
  useEffect(() => {
    void load();
  }, []);
  async function mutate(
    url: string,
    method: string,
    body: unknown,
    message: string,
  ) {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          method === "POST"
            ? {
                ...(body as object),
                clientRequestId:
                  requestIds.current.get(url + JSON.stringify(body)) ||
                  (() => {
                    const id = crypto.randomUUID();
                    requestIds.current.set(url + JSON.stringify(body), id);
                    return id;
                  })(),
              }
            : body,
        ),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "השינוי לא נשמר");
      await load();
      window.dispatchEvent(new Event("samgad:saved"));
      requestIds.current.delete(url + JSON.stringify(body));
      setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "השינוי לא נשמר");
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  if (loading)
    return (
      <main className="state-screen">
        <LoaderCircle className="spin" />
        <h2>מכינים את תמונת המצב…</h2>
      </main>
    );
  if (!data)
    return (
      <main className="state-screen">
        <AlertCircle />
        <h2>המידע אינו זמין כרגע</h2>
        <p>{error}</p>
        <button className="button primary" onClick={() => void load()}>
          ניסיון נוסף
        </button>
        <a className="button secondary" href="/login">כניסה עם חשבון אחר</a>
      </main>
    );
  const person = (id: string) =>
    data.users.find((x) => x.id === id)?.name || "משתמש";
  const domainName = (id: string) =>
    data.domains.find((x) => x.id === id)?.name || "כללי";
  const overdue = (t: Task) => isOverdue(t, data.today);
  const manager = ["deputy", "staff", "company_commander"].includes(
    data.user.role,
  );
  const canWrite = manager || data.user.role === "contributor";
  const guest=Boolean(data.user.permissions?.guest);
  const ownerInterface=Boolean(data.user.permissions?.manageAccess || data.user.permissions?.editAll);
  const availableNav=nav.filter(([id])=>id!=="personal" || Boolean(data.user.permissions?.manageAccess && data.user.id===(data.user.workspaceOwnerId || data.user.id)));
  const task = data.tasks.find((t) => t.id === selected);
  const scopedTasks=data.tasks.filter(t=>view==="personal"?isPersonalTask(t,data.user.workspaceOwnerId || data.user.id):!ownerInterface||!isPersonalTask(t,data.user.workspaceOwnerId || data.user.id));
  const late = scopedTasks.filter(overdue);
  const pending = data.decisions.filter((d) =>
    ["pending", "clarification_requested"].includes(d.status),
  );
  const filtered = scopedTasks.filter(
    (t) =>
      (!query ||
        `${t.title} ${t.description} ${person(t.ownerId)}`.includes(query)) &&
      (!domain || t.domainId === domain) &&
      matchesTaskFilter({done:t.status==='completed',pending:t.status==='pending_review',cancelled:t.status==='cancelled',dueDate:t.dueDate,urgent:t.priority==='urgent',important:['high','urgent'].includes(t.priority),ownerId:t.ownerId,creatorId:t.creatorId,status:t.status},filter,data.today,data.user.id),
  );
  filtered.sort((a,b)=>compareTasks({...a,done:a.status==="completed",pinned:data.pinnedTaskKeys?.includes("task:"+a.id)},{...b,done:b.status==="completed",pinned:data.pinnedTaskKeys?.includes("task:"+b.id)},sort));
  const canEditTask=(t:Task)=>canWrite && (manager || t.ownerId===data!.user.id);
  function taskRow(t: Task) {
    const canAct = canEditTask(t);
    return <SwipeTaskRow canExtendDirectly={ownerInterface} key={t.id} task={{kind:"task",id:t.id}} title={t.title} pinned={Boolean(data!.pinnedTaskKeys?.includes("task:"+t.id))} canEdit={canAct} canDelete={canWrite&&(manager||t.creatorId===data!.user.id)} className={`task-row ${taskTone(t.status==="completed",t.status==="cancelled"?null:t.dueDate,data!.today)}`}>
      {view === "tasks" && canAct && <input type="checkbox" aria-label={`בחירת ${t.title}`} checked={taskSelection.includes(t.id)} onChange={e=>setTaskSelection(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id))}/>}
      <span className={`status-dot ${t.status}`} />
      <button className="task-main task-open" onClick={() => go(view, filter, domain, t.id, query)}>
        <strong>{data!.pinnedTaskKeys?.includes("task:"+t.id)&&<span className="task-pin-label">📌 מוצמדת · </span>}{t.title}</strong><span className="row-meta">{domainName(t.domainId)} · {person(t.ownerId)}</span>
      </button>
      <span className="task-row-end"><Badge value={t.status}/><span className={overdue(t)?"date late":"date"}>תג״ב: {date(t.dueDate)}</span></span>
      {canAct && t.status !== "cancelled" && <button className="button secondary" disabled={taskActions.busy || (t.status === "pending_review" && !manager)} onClick={() => void taskActions.run([{url:`/api/tasks/${t.id}`,method:"PATCH",body:{version:t.version,status:t.status === "completed" ? "in_progress" : t.ownerId !== t.creatorId && !manager ? "pending_review" : "completed"}}])}>{t.status === "completed" ? "לא בוצע" : t.status === "pending_review" ? manager ? "אשר" : "ממתין לאישור" : "בוצע"}</button>}
      <TaskActions canMoveToPersonal={data!.user.id===(data!.user.workspaceOwnerId || data!.user.id)&&!isPersonalTask(t,data!.user.id)} canExtendDirectly={ownerInterface} task={{kind:"task",id:t.id}} title={t.title} version={t.version} dueDate={t.dueDate} pinned={Boolean(data!.pinnedTaskKeys?.includes("task:"+t.id))} canEdit={canAct} canDelete={canWrite&&(manager||t.creatorId===data!.user.id)} onSaved={load}/>
    </SwipeTaskRow>;
  }
  function activityList(items: Data["activity"]) {
    return items.length ? (
      <div className="activity-list">
        {items.map((a) => (
          <div className="activity-item" key={a.id}>
            <span className="activity-icon">
              <History size={14} />
            </span>
            <div>
              <strong>{a.summary || a.action}</strong>
              <p>
                {a.actorName} <span>· {date(a.createdAt)}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty>עדכונים יופיעו כאן לאחר הפעולה הראשונה.</Empty>
    );
  }
  async function submitTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries());
    if (
      await mutate(
        "/api/tasks",
        "POST",
        {
          ...body,
          dueDate: body.dueDate || null,
          companyId: body.companyId || null,
        },
        "המשימה נוצרה בהצלחה",
      )
    )
      setModal("");
  }
  async function submitDecision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await mutate(
        "/api/decisions",
        "POST",
        Object.fromEntries(f.entries()),
        "הבקשה להחלטה נוצרה",
      )
    )
      setModal("");
  }
  const title = view==="access"?"הרשאות":nav.find((n) => n[0] === view)?.[1] || "ראשי";
  return (
    <div className={`app-shell battalion-app ${view === "dashboard" ? "command-home" : ""}`} >
      <PushAutoRestore key={data.user.id}/>
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go("dashboard");
          }}
        >
          <span className="brand-mark">
            <Layers3 size={24} />
          </span>
          <span>
            {ownerInterface ? "סמג״ד המחץ" : "סגני המחץ"}<small>{ownerInterface ? "ממשק מנהל" : "מרחב בעלי התפקידים"}</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">מ</span>
          <span>
            {data.demo ? "מרחב ההדגמה" : "מרחב העבודה"}
            <small>תמונת מצב משותפת</small>
          </span>
          <span className="workspace-dot" />
        </div>
        <span className="nav-caption">מרחב העבודה</span>
        <nav>
          {availableNav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {label}
              {id === "decisions" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
          {data.user.permissions?.manageAccess && <button className={view==="access"?"nav-item active":"nav-item"} onClick={()=>go("access")}><ShieldCheck size={19}/>ניהול גישה</button>}
        </nav>
        <div className="sidebar-bottom">
          <div className="safe-note">
            <ShieldCheck size={19} />
            <p>
              ניהול מנהלתי בלבד
              {data.demo && <small>מידע סינתטי בסביבת הדגמה</small>}
            </p>
          </div>
          <div className="profile">
            <span className="avatar">{data.user.name.slice(0, 1)}</span>
            <span>
              <strong>{data.user.name}</strong>
              <small>{guest?"צפייה בלבד":"מחובר למרחב העבודה"}</small>
            </span>
            <button
              className="icon-button"
              aria-label={guest?"כניסה לחשבון":"יציאה מהמערכת"}
              onClick={async () => {
                if(guest){location.href="/login";return;}
                if ((await offlineStatus()).length) { setError("יש שינויים שממתינים לסנכרון. יש לסנכרן לפני יציאה"); return; }
                const result = await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                if (!result.ok) { setError("היציאה לא הצליחה. יש לנסות כשיש אינטרנט"); return; }
                await clearOffline();
                location.href = "/login";
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            מרחב העבודה <ChevronLeft size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            {data.user.permissions?.manageAccess && <button className="icon-button" aria-label="ניהול הרשאות" title="ניהול גישה לפי מייל" onClick={()=>go("access")}><ShieldCheck size={18}/></button>}
            {guest && <button className="button secondary" onClick={()=>location.href="/login"}>כניסה</button>}
            {data.demo && (
              <span className="demo-label">
                <span />
                נתוני הדגמה
              </span>
            )}
            <button
              className="icon-button"
              aria-label="רענון מידע"
              onClick={() => void load()}
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar small">{data.user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="main-content">
          <DeadlineRequests manager={ownerInterface}/>
          <TaskTools key={data.user.id} userId={data.user.workspaceOwnerId || data.user.id} role={data.user.role} personalAllowed={Boolean(data.user.permissions?.manageAccess && data.user.id===(data.user.workspaceOwnerId || data.user.id))} tasks={data.tasks} dashboard={false} onSaved={load} />
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {new Date().toLocaleDateString("he-IL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "Asia/Jerusalem",
                })}
              </span>
              <h1>
                {view === "dashboard" ? "הכול ברור. מכאן מתקדמים." : title}
              </h1>
              <p>
                {view === "dashboard"
                  ? "המשימות, ההחלטות והאנשים שדורשים את תשומת הלב שלך."
                  : view === "personal"
                    ? "המשימות הפרטיות והשעל״ח שלך, במקום אחד."
                    : view === "tasks"
                      ? "אחריות ברורה. התקדמות מתועדת. שום דבר לא נופל בין הכיסאות."
                      : view === "decisions"
                        ? "הבקשות שמחכות לכיוון שלך, וההחלטות שכבר התקבלו."
                        : view === "library"
                          ? "פקודות, בד״חים, פורמטים ונהלים מסודרים בתיקיות."
                          : view === "records"
                            ? "סיכומי ישיבות וביקורות, בטקסט ובקבצים."
                            : view === "domains"
                              ? "מבט ממוקד על העבודה בכל תחום אחריות."
                              : "כל שינוי משמעותי, מתועד במקום אחד."}
              </p>
            </div>
            {!["personal", "tasks", "library", "records"].includes(view) &&
              (manager || (view === "decisions" && canWrite)) && (
                <button
                  className="button primary"
                  onClick={() =>
                    view === "decisions" ? setModal("decision") : window.dispatchEvent(new Event("samgad:capture"))
                  }
                >
                  <Plus size={18} />
                  {view === "decisions" ? "בקשה להחלטה" : "יצירת משימה"}
                </button>
              )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              {error}
              <button
                onClick={() => setError("")}
                aria-label="סגירת הודעת שגיאה"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "personal" && data.user.permissions?.manageAccess && data.user.id===(data.user.workspaceOwnerId || data.user.id) && (
            <PersonalRhythm
              key={data.user.id}
              userId={data.user.workspaceOwnerId || data.user.id}
              role={data.user.role}
              legacyTasks={data.tasks.filter(t=>isPersonalTask(t,data.user.workspaceOwnerId || data.user.id))}
              scope="personal"
            />
          )}
          {view === "dashboard" && ownerInterface && <CommandDashboard key={data.user.id} pinnedTaskKeys={data.pinnedTaskKeys} user={data.user} tasks={data.tasks} users={data.users} today={data.today} activity={data.activity} go={go}/> }
          {view === "dashboard" && !ownerInterface && <DeputiesDashboard pinnedTaskKeys={data.pinnedTaskKeys} user={data.user} tasks={data.tasks} today={data.today} go={go} />}
          {view === "calendar" && <Schedule owner={Boolean(data.user.permissions?.manageAccess && data.user.id===(data.user.workspaceOwnerId || data.user.id))} manager={ownerInterface}/>}
          {view === "access" && data.user.permissions?.manageAccess && <AccessSettings />}
          {guest && <div className="guest-banner">מצב צפייה בלבד · האזור האישי אינו מוצג <a href="/login">כניסה לחשבון לעריכת המשימות שלך</a></div>}
          {view === "tasks" && (
            <PersonalRhythm
              key={data.user.id}
              userId={data.user.id}
              role={data.user.role}
              scope="assigned"
              manageRhythm={ownerInterface}
              canMoveToPersonal={data.user.id===(data.user.workspaceOwnerId || data.user.id)}
            />
          )}
          {view === "library" && (
            <DocumentLibrary
              section="library"
              userId={data.user.id}
              role={data.user.role}
            />
          )}
          {view === "records" && (
            <DocumentLibrary
              section="records"
              userId={data.user.id}
              role={data.user.role}
            />
          )}
          {(view === "tasks" || view==="personal" && filtered.length>0) && (
            <section className="panel tasks-panel">
              <div className="task-tabs">
                {[
                  ["all", "כל המשימות"],
                  ["mine", "המשימות שלי"],
                  ["actionable", "לביצוע"],
                  ["due_soon", "דחוף"],
                  ["overdue", "באיחור"],
                  ["pending_review", "לבדיקה"],
                  ["completed", "ארכיון משימות שבוצעו"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={filter === id ? "active" : ""}
                    onClick={() => go(view, id, domain, "", query)}
                  >
                    {label}
                    {id === "overdue" && late.length > 0 && (
                      <span>{late.length}</span>
                    )}
                  </button>
                ))}
              </div>
              <TaskFilters archived={filter==="completed"} onArchive={()=>go(view,filter==="completed"?"all":"completed")} count={filtered.length} active={Boolean(domain)||sort!=="deadline_desc"} search={<label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="חיפוש משימות"
                    placeholder="חיפוש משימה, תיאור או אחראי…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      const p = new URLSearchParams(location.search);
                      if (e.target.value) p.set("q", e.target.value);
                      else p.delete("q");
                      history.replaceState({}, "", `${location.pathname}?${p}`);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                  />
                </label>}>
                <label className="filter-select">
                  <select
                    aria-label="תחום אחריות"
                    value={domain}
                    onChange={(e) =>
                      go(view, filter, e.target.value, "", query)
                    }
                  >
                    <option value="">כל תחומי האחריות</option>
                    {data.domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>מיון<select aria-label="מיון רשימת המשימות" value={sort} onChange={e=>{const p=new URLSearchParams(location.search);p.set("sort",e.target.value);history.replaceState({},"",location.pathname+"?"+p);window.dispatchEvent(new PopStateEvent("popstate"));}}>{Object.entries(taskSorts).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
              </TaskFilters>
              <p className="task-swipe-help task-list-hint">החליקו משימה לפעולות מהירות · או לחצו על ⋯</p>
              {taskSelection.length>0 && canWrite && <div className="bulk-toolbar"><strong>{taskSelection.length} נבחרו</strong><button className="button primary" disabled={taskActions.busy} onClick={async()=>{const ops=filtered.filter(t=>taskSelection.includes(t.id) && !["completed","cancelled"].includes(t.status) && (manager || t.ownerId===data.user.id) && (t.status!=="pending_review" || manager)).map(t=>({url:`/api/tasks/${t.id}`,method:"PATCH",body:{version:t.version,status:manager?"completed":"pending_review"}}));if(ops.length && await taskActions.run(ops))setTaskSelection([]);}}>ביצוע / אישור</button>{manager && <><select aria-label="אחראי למשימות הנבחרות" value={batchOwner} onChange={e=>setBatchOwner(e.target.value)}><option value="">בחירת אחראי</option>{data.users.filter(u=>!["viewer","admin"].includes(u.role)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><button className="button secondary" disabled={taskActions.busy || !batchOwner} onClick={async()=>{const ops=filtered.filter(t=>taskSelection.includes(t.id) && manager).map(t=>({url:`/api/tasks/${t.id}`,method:"PATCH",body:{version:t.version,ownerId:batchOwner}}));if(ops.length && await taskActions.run(ops))setTaskSelection([]);}}>שינוי אחראי</button></>}<button className="button secondary" onClick={()=>setTaskSelection([])}>ניקוי בחירה</button></div>}
              {filtered.length ? (
                filtered.map(taskRow)
              ) : (
                <Empty>לא נמצאו משימות. נסו לשנות את החיפוש או המסננים.</Empty>
              )}
            </section>
          )}
          {view === "decisions" && (
            <div className="decision-grid">
              {data.decisions.length ? (
                data.decisions.map((d) => (
                  <section className="panel decision-card" key={d.id}>
                    <div className="decision-card-top">
                      <span className="eyebrow">{domainName(d.domainId)}</span>
                      <Badge value={d.status} decision />
                    </div>
                    <h2>{d.title}</h2>
                    <p className="description">{d.description}</p>
                    <div className="decision-people">
                      <span>
                        <UserRound size={15} />
                        מבקש: {person(d.requesterId)}
                      </span>
                      <span>מחליט: {person(d.deciderId)}</span>
                    </div>
                    {d.notes && (
                      <div className="decision-notes">
                        <strong>תיעוד ההחלטה</strong>
                        <p>{d.notes}</p>
                      </div>
                    )}
                    {manager &&
                      d.deciderId === data.user.id &&
                      ["pending", "clarification_requested"].includes(
                        d.status,
                      ) && (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            await mutate(
                              `/api/decisions/${d.id}`,
                              "PATCH",
                              {
                                version: d.version,
                                status: f.get("status"),
                                notes: f.get("notes"),
                              },
                              "ההחלטה נשמרה ותועדה",
                            );
                          }}
                        >
                          <label>
                            הערות להחלטה
                            <textarea
                              name="notes"
                              required
                              placeholder="הנחיות, נימוק או מידע נוסף שנדרש"
                            />
                          </label>
                          <div className="form-inline">
                            <label>
                              החלטה
                              <select name="status" defaultValue="approved">
                                <option value="approved">אישור הבקשה</option>
                                <option value="rejected">דחיית הבקשה</option>
                                <option value="clarification_requested">
                                  בקשת הבהרה
                                </option>
                              </select>
                            </label>
                            <button className="button primary" disabled={busy}>
                              <Check size={16} />
                              שמירת החלטה
                            </button>
                          </div>
                        </form>
                      )}
                    <div className="card-date">נוצרה ב־{date(d.createdAt)}</div>
                  </section>
                ))
              ) : (
                <Empty>אין בקשות להחלטה במרחב.</Empty>
              )}
            </div>
          )}
          {view === "domains" && (
            <div className="all-domains">
              {data.domains.map((d, i) => {
                const ts = scopedTasks.filter((t) => t.domainId === d.id);
                return (
                  <button
                    key={d.id}
                    className="panel domain-large"
                    onClick={() => go("tasks", "all", d.id)}
                  >
                    <span className={`domain-icon tone-${i % 4}`}>
                      <Layers3 size={22} />
                    </span>
                    <h2>{d.name}</h2>
                    <div className="domain-stats">
                      <span>
                        <strong>
                          {
                            ts.filter(
                              (t) =>
                                !["completed", "cancelled"].includes(t.status),
                            ).length
                          }
                        </strong>
                        פתוחות
                      </span>
                      <span>
                        <strong>{ts.filter(overdue).length}</strong>באיחור
                      </span>
                    </div>
                    <span className="text-action">
                      פתיחת המשימות בתחום <ArrowLeft size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {view === "activity" && (
            <section className="panel">
              <PanelHeading
                title="היסטוריית פעילות"
                count={data.activity.length}
              />
              {activityList(data.activity)}
            </section>
          )}
          <footer className="page-footer">
            <ShieldCheck size={14} />
            {data.demo ? "נתוני הדגמה סינתטיים בלבד" : "מרחב ניהול מנהלתי"}{" "}
            <span>·</span> עודכן ב־{refreshed}
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="ניווט ראשי">
        {[["records","סיכומי ישיבות",NotebookPen],["tasks","משימות",CheckCheck],["dashboard","ראשי",House],["library","ספרייה",LibraryBig],["more","עוד",Menu]].map(([id,label,Icon])=>{const NavIcon=Icon as typeof Menu;return <button key={String(id)} className={view===id?"active":""} aria-current={view===id?"page":undefined} onClick={()=>id==="more"?setModal("navigation"):go(String(id))}><NavIcon size={24}/><span>{String(label)}</span></button>})}
      </nav>
      {modal === "navigation" && <Modal title="עוד במערכת" close={()=>setModal("")}><div className="more-navigation"><PushSettings/>{availableNav.map(([id,label,Icon])=><button className="nav-item" key={id} onClick={()=>{go(id);setModal("");}}><Icon size={22}/>{label}</button>)}{data.user.permissions?.manageAccess&&<button className="nav-item" onClick={()=>{go("access");setModal("");}}><ShieldCheck size={22}/>ניהול גישה</button>}<button className="nav-item" onClick={()=>{setModal("");location.href="/login";}}><UserRound size={22}/>מסך כניסה</button></div></Modal>}
      <TaskActionNotice/>
      {taskActions.error && <div className="quick-notice" role="alert">{taskActions.error}<button onClick={()=>void load()}>רענון</button></div>}
      {taskActions.notice && <div className="quick-notice" role="status">{taskActions.notice}{taskActions.undo.length>0 && <button disabled={taskActions.busy} onClick={()=>void taskActions.cancel()}>ביטול פעולה</button>}</div>}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {modal && modal !== "navigation" && (
        <Modal
          title={modal === "task" ? "יצירת משימה" : "בקשה להחלטה"}
          close={() => setModal("")}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={modal === "task" ? submitTask : submitDecision}>
            <label>
              {modal === "task" ? "כותרת המשימה" : "נושא ההחלטה"}
              <input
                name="title"
                required
                maxLength={160}
                placeholder={
                  modal === "task" ? "מה צריך לבצע?" : "איזו החלטה נדרשת?"
                }
              />
            </label>
            <label>
              תיאור
              <textarea
                name="description"
                placeholder="הקשר, תוצאה רצויה והמידע הדרוש לביצוע"
              />
            </label>
            <div className="form-grid">
              <label>
                {modal === "task" ? "אחראי לביצוע" : "מחליט"}
                <select
                  name={modal === "task" ? "ownerId" : "deciderId"}
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    בחירת אחראי
                  </option>
                  {data.users
                    .filter(
                      (u) =>
                        !["admin", "viewer"].includes(u.role) &&
                        (modal !== "decision" ||
                          ["deputy", "staff", "company_commander"].includes(
                            u.role,
                          )),
                    )
                    .map((u) => (
                      <option value={u.id} key={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                תחום אחריות
                <select name="domainId" required defaultValue="">
                  <option value="" disabled>
                    בחירת תחום
                  </option>
                  {data.domains.map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                עדיפות
                <select name="priority" defaultValue="normal">
                  {Object.entries(priorities).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {modal === "task" && (
                <>
                  <label>
                    מועד סיום
                    <input type="date" name="dueDate" />
                  </label>
                  <label>
                    פלוגה
                    <select name="companyId">
                      <option value="">כלל המרחב</option>
                      {data.companies.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                {busy
                  ? "נשמר…"
                  : modal === "task"
                    ? "שמירת משימה"
                    : "שליחת בקשה"}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  window.dispatchEvent(new Event("samgad:modal-dismiss"))
                }
              >
                ביטול
              </button>
            </div>
          </form>
        </Modal>
      )}
      {task && (
        <Modal
          wide
          title="פרטי משימה"
          close={() => go(view, filter, domain, "", query)}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="detail-top">
            <Badge value={task.status} />
            <Badge value={task.priority} />
            <span className="muted">{domainName(task.domainId)}</span>
          </div>
          <h2 className="detail-title">{task.title}</h2>
          <div className="detail-facts">
            <span>
              <UserRound size={16} />
              {person(task.ownerId)}
            </span>
            <span className={overdue(task) ? "late" : ""}>
              <CalendarDays size={16} />
              {date(task.dueDate)}
              {overdue(task) && " · באיחור"}
            </span>
          </div>
          <p className="description">
            {task.description || "לא נוסף תיאור למשימה."}
          </p>
          {canEditTask(task) && <div className="rhythm-toolbar">
            <button className="button secondary" disabled={busy} onClick={() => void mutate(`/api/tasks/${task.id}`, "PATCH", {version:task.version, status:"in_progress"}, "המשימה סומנה לא בוצע")}>לא בוצע</button>
            {task.status !== "completed" && (manager || task.ownerId === data.user.id) && <button className="button primary" disabled={busy} onClick={() => void mutate(`/api/tasks/${task.id}`, "PATCH", {version:task.version, status:task.ownerId !== task.creatorId && !manager ? "pending_review" : "completed"}, "מצב הביצוע נשמר")}>{task.status === "pending_review" && manager ? "אישור ביצוע" : "בוצע"}</button>}
          </div>}
          {canEditTask(task) && (
            <details className="edit-details" open>
              <summary>עדכון משימה</summary>
              <form
                key={`${task.id}-${task.version}`}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await mutate(
                    `/api/tasks/${task.id}`,
                    "PATCH",
                    {
                      version: task.version,
                      ...(manager
                        ? {
                            ...Object.fromEntries(f.entries()),
                            dueDate: f.get("dueDate") || null,
                          }
                        : {
                            title:f.get("title"),status: f.get("status"),priority:f.get("priority"),dueDate:manager?f.get("dueDate")||null:task.dueDate,
                          }),
                    },
                    "פרטי המשימה עודכנו",
                  );
                }}
              >
                {canEditTask(task) && (
                  <label>
                    כותרת המשימה
                    <input
                      name="title"
                      defaultValue={task.title}
                      required
                      maxLength={160}
                    />
                  </label>
                )}
                <div className="form-grid">
                  <label>
                    סטטוס
                    <select name="status" defaultValue={task.status}>
                      {Object.entries(statuses)
                        .filter(([v]) => {
                          if (v === "blocked") return false;
                          try {
                            assertTransition(
                              {
                                userId: data.user.id,
                                name: data.user.name,
                                organizationId: "",
                                companyId: null,
                                domainId: null,
                                role: data.user.role,
                              },
                              task,
                              v as TaskStatus,
                            );
                            return true;
                          } catch {
                            return false;
                          }
                        })
                        .map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                    </select>
                  </label>
                  {canEditTask(task) && (
                    <>
                      <label>
                        עדיפות
                        <select name="priority" defaultValue={task.priority}>
                          {Object.entries(priorities).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                      {manager && <label>
                        אחראי לביצוע
                        <select name="ownerId" defaultValue={task.ownerId}>
                          {data.users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </label>}
                      <label>
                        מועד סיום
                        <input
                          name="dueDate"
                          type="date"
                          defaultValue={task.dueDate || ""}
                          disabled={!manager}
                        />
                      </label>
                    </>
                  )}
                </div>
                <div className="modal-actions">
                  <button className="button primary" disabled={busy}>
                    שמירת שינויים
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        `/api/tasks/${task.id}/comments`,
                        "POST",
                        { body: "התבקש עדכון התקדמות" },
                        "בקשת העדכון תועדה במשימה",
                      )
                    }
                  >
                    תיעוד בקשת עדכון
                  </button>
                </div>
              </form>
            </details>
          )}
          <section className="comments-section">
            <h3>עדכונים ושיח</h3>
            {task.comments.length ? (
              task.comments.map((c) => (
                <div className="comment" key={c.id}>
                  <div>
                    <strong>{c.actorName}</strong>
                    <time>{date(c.createdAt)}</time>
                  </div>
                  <p>{c.body}</p>
                </div>
              ))
            ) : (
              <p className="muted">עדיין לא נוספו עדכונים למשימה.</p>
            )}
            {canEditTask(task) && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  if (
                    await mutate(
                      `/api/tasks/${task.id}/comments`,
                      "POST",
                      { body: f.get("body") },
                      "העדכון נוסף למשימה",
                    )
                  )
                    form.reset();
                }}
              >
                <label>
                  הוספת עדכון
                  <textarea
                    name="body"
                    required
                    placeholder="מה התקדם? מה נדרש להמשך?"
                  />
                </label>
                <button className="button secondary" disabled={busy}>
                  <Send size={16} />
                  פרסום עדכון
                </button>
              </form>
            )}
          </section>
          <section>
            <h3>היסטוריית המשימה</h3>
            {activityList(data.activity.filter((a) => a.entityId === task.id))}
          </section>
        </Modal>
      )}
    </div>
  );
}
