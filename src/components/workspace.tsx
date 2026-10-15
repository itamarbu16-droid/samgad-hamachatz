"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { isOverdue, assertTransition, type TaskStatus } from "@/server/policy";
import DocumentLibrary from "./document-library";
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
  Clock3,
  AlertCircle,
  ChevronLeft,
  SlidersHorizontal,
  RefreshCw,
  UserRound,
  CalendarDays,
  LibraryBig,
  NotebookPen,
  Send,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
type Person = { id: string; name: string; role: string };
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
  ["dashboard", "סקירה כללית", LayoutDashboard],
  ["tasks", "משימות", CheckCheck],
  ["personal", "אישי", UserRound],
  ["library", "ספרייה", LibraryBig],
  ["records", "סיכומי ישיבות וביקורות", NotebookPen],
  ["decisions", "ממתין להחלטה", CircleHelp],
  ["domains", "תחומי אחריות", Layers3],
  ["activity", "פעילות אחרונה", History],
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
    history.pushState({}, "", `/${p.size ? "?" + p : ""}`);
    sync();
  }
  async function load() {
    try {
      const r = await fetch("/api/workspace", { cache: "no-store" });
      if (r.status === 401) {
        location.href = "/login";
        return;
      }
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "לא ניתן לטעון את המידע");
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
      const r = await fetch(url, {
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
  const task = data.tasks.find((t) => t.id === selected);
  const open = data.tasks.filter(
    (t) => !["completed", "cancelled"].includes(t.status),
  );
  const late = data.tasks.filter(overdue);
  const pending = data.decisions.filter((d) =>
    ["pending", "clarification_requested"].includes(d.status),
  );
  const filtered = data.tasks.filter(
    (t) =>
      (!query ||
        `${t.title} ${t.description} ${person(t.ownerId)}`.includes(query)) &&
      (!domain || t.domainId === domain) &&
      (filter === "all" ||
        (filter === "mine"
          ? t.ownerId === data.user.id
          : filter === "assigned"
            ? t.creatorId === data.user.id
            : filter === "overdue"
              ? overdue(t)
              : filter === "urgent"
                ? t.priority === "urgent" &&
                  !["completed", "cancelled"].includes(t.status)
                : filter === "active"
                  ? !["completed", "cancelled"].includes(t.status)
                  : t.status === filter)),
  );
  const attention = [
    ...late,
    ...open.filter(
      (t) => t.priority === "urgent" && !late.some((x) => x.id === t.id),
    ),
  ];
  function taskRow(t: Task) {
    const canAct = canWrite && (t.ownerId === data!.user.id || t.creatorId === data!.user.id);
    return <div key={t.id} className="task-row">
      {view === "tasks" && canAct && <input type="checkbox" aria-label={`בחירת ${t.title}`} checked={taskSelection.includes(t.id)} onChange={e=>setTaskSelection(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id))}/>}
      <span className={`status-dot ${t.status}`} />
      <button className="task-main task-open" onClick={() => go(view, filter, domain, t.id, query)}>
        <strong>{t.title}</strong><span className="row-meta">{domainName(t.domainId)} · {person(t.ownerId)}</span>
      </button>
      <span className="task-row-end"><Badge value={t.status}/><span className={overdue(t)?"date late":"date"}>{date(t.dueDate)}</span></span>
      {canAct && t.status !== "cancelled" && <button className="button secondary" disabled={taskActions.busy || (t.status === "pending_review" && t.creatorId !== data!.user.id)} onClick={() => void taskActions.run([{url:`/api/tasks/${t.id}`,method:"PATCH",body:{version:t.version,status:t.status === "completed" ? "in_progress" : t.ownerId !== t.creatorId && t.creatorId !== data!.user.id ? "pending_review" : "completed"}}])}>{t.status === "completed" ? "לא בוצע" : t.status === "pending_review" ? t.creatorId === data!.user.id ? "אשר" : "ממתין לאישור" : "בוצע"}</button>}
    </div>;
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
  const title = nav.find((n) => n[0] === view)?.[1] || "סקירה כללית";
  return (
    <div className="app-shell">
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
            סמג״ד המחץ<small>מרחב ניהול מנהלתי</small>
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
          {nav.map(([id, label, Icon]) => (
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
              <small>מחובר למרחב העבודה</small>
            </span>
            <button
              className="icon-button"
              aria-label="יציאה מהמערכת"
              onClick={async () => {
                await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
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
          <TaskTools userId={data.user.id} role={data.user.role} tasks={data.tasks} dashboard={view === "dashboard"} onSaved={load} />
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
          {view === "personal" && (
            <PersonalRhythm
              userId={data.user.id}
              role={data.user.role}
              scope="personal"
            />
          )}
          {view === "dashboard" && (
            <>
              <section className="attention-strip">
                <div className="attention-intro">
                  <span className="eyebrow">מיקוד להיום</span>
                  <h2>מה דורש תשומת לב?</h2>
                  <p>
                    עודכן בשעה <bdi>{refreshed}</bdi>
                  </p>
                </div>
                {[
                  {
                    n: late.length,
                    label: "משימות באיחור",
                    text: "לבדיקת מועדים ואחריות",
                    icon: Clock3,
                    filter: "overdue",
                    color: "red",
                  },
                  {
                    n: pending.length,
                    label: "ממתינות להחלטה",
                    text: "לעיון ולקבלת החלטה",
                    icon: CircleHelp,
                    filter: "decisions",
                    color: "teal",
                  },
                ].map((m) => (
                  <button
                    key={m.filter}
                    className={`metric ${m.color}`}
                    onClick={() =>
                      go(
                        m.filter === "decisions" ? "decisions" : "tasks",
                        m.filter === "decisions" ? "all" : m.filter,
                      )
                    }
                  >
                    <span className="metric-top">
                      <m.icon size={19} />
                      <ArrowLeft size={17} />
                    </span>
                    <strong>{m.n.toString().padStart(2, "0")}</strong>
                    <span className="metric-label">{m.label}</span>
                    <small>{m.text}</small>
                  </button>
                ))}
              </section>
              <div className="dashboard-grid">
                <div>
                  <section className="panel">
                    <PanelHeading
                      title="על סדר היום"
                      count={attention.length}
                      action="לכל המשימות"
                      onClick={() => go("tasks")}
                    />
                    {attention.length ? (
                      attention.slice(0, 5).map(taskRow)
                    ) : (
                      <Empty>
                        אין משימות דחופות או באיחור. אפשר להתמקד בהמשך העבודה.
                      </Empty>
                    )}
                    <div className="panel-footer">
                      <span className="mini-dot" />
                      {open.length} משימות פתוחות במרחב{" "}
                      <button onClick={() => go("tasks", "active")}>
                        לתמונה המלאה <ArrowLeft size={14} />
                      </button>
                    </div>
                  </section>
                  <section className="panel domains-panel">
                    <PanelHeading
                      title="תחומי אחריות"
                      action="לכל התחומים"
                      onClick={() => go("domains")}
                    />
                    <div className="domain-grid">
                      {data.domains.slice(0, 6).map((d, i) => {
                        const ts = open.filter((t) => t.domainId === d.id);
                        return (
                          <button
                            className="domain-card"
                            key={d.id}
                            onClick={() => go("tasks", "active", d.id)}
                          >
                            <span className={`domain-icon tone-${i % 4}`}>
                              <Layers3 size={18} />
                            </span>
                            <strong>{d.name}</strong>
                            <span>
                              {ts.length} פתוחות{" "}
                              <span className="muted">/</span>{" "}
                              <span
                                className={ts.some(overdue) ? "late" : "muted"}
                              >
                                {ts.filter(overdue).length} באיחור
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
                <div>
                  <section className="panel">
                    <PanelHeading title="ממתין להחלטה" count={pending.length} />
                    {pending.length ? (
                      pending.slice(0, 3).map((d) => (
                        <button
                          className="decision-preview"
                          key={d.id}
                          onClick={() => go("decisions")}
                        >
                          <span className="eyebrow">
                            {domainName(d.domainId)}
                          </span>
                          <strong>{d.title}</strong>
                          <span className="row-meta">
                            {person(d.requesterId)} · {date(d.createdAt)}
                          </span>
                          <span className="text-action">
                            לעיון ולהחלטה <ArrowLeft size={14} />
                          </span>
                        </button>
                      ))
                    ) : (
                      <Empty>כל ההחלטות מטופלות כרגע.</Empty>
                    )}
                  </section>
                  <section className="panel">
                    <PanelHeading
                      title="מה התחדש"
                      action="הכול"
                      onClick={() => go("activity")}
                    />
                    {activityList(data.activity.slice(0, 4))}
                  </section>
                </div>
              </div>
            </>
          )}
          {view === "tasks" && (
            <PersonalRhythm
              userId={data.user.id}
              role={data.user.role}
              scope="assigned"
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
          {view === "tasks" && (
            <section className="panel tasks-panel">
              <div className="task-tabs">
                {[
                  ["all", "כל המשימות"],
                  ["mine", "המשימות שלי"],
                  ["overdue", "באיחור"],
                  ["pending_review", "לבדיקה"],
                  ["completed", "הושלמו"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={filter === id ? "active" : ""}
                    onClick={() => go("tasks", id, domain, "", query)}
                  >
                    {label}
                    {id === "overdue" && late.length > 0 && (
                      <span>{late.length}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="filters">
                <label className="search-field">
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
                      history.replaceState({}, "", `/?${p}`);
                    }}
                  />
                </label>
                <label className="filter-select">
                  <SlidersHorizontal size={16} />
                  <select
                    aria-label="תחום אחריות"
                    value={domain}
                    onChange={(e) =>
                      go("tasks", filter, e.target.value, "", query)
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
                <span className="results-count">{filtered.length} משימות</span>
              </div>
              {taskSelection.length>0 && canWrite && <div className="bulk-toolbar"><strong>{taskSelection.length} נבחרו</strong><button className="button primary" disabled={taskActions.busy} onClick={async()=>{const ops=filtered.filter(t=>taskSelection.includes(t.id) && !["completed","cancelled"].includes(t.status) && (t.creatorId===data.user.id || t.ownerId===data.user.id) && (t.status!=="pending_review" || t.creatorId===data.user.id)).map(t=>({url:`/api/tasks/${t.id}`,method:"PATCH",body:{version:t.version,status:t.creatorId===data.user.id?"completed":"pending_review"}}));if(ops.length && await taskActions.run(ops))setTaskSelection([]);}}>ביצוע / אישור</button>{manager && <><select aria-label="אחראי למשימות הנבחרות" value={batchOwner} onChange={e=>setBatchOwner(e.target.value)}><option value="">בחירת אחראי</option>{data.users.filter(u=>!["viewer","admin"].includes(u.role)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><button className="button secondary" disabled={taskActions.busy || !batchOwner} onClick={async()=>{const ops=filtered.filter(t=>taskSelection.includes(t.id) && t.creatorId===data.user.id).map(t=>({url:`/api/tasks/${t.id}`,method:"PATCH",body:{version:t.version,ownerId:batchOwner}}));if(ops.length && await taskActions.run(ops))setTaskSelection([]);}}>שינוי אחראי</button></>}<button className="button secondary" onClick={()=>setTaskSelection([])}>ניקוי בחירה</button></div>}
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
                const ts = data.tasks.filter((t) => t.domainId === d.id);
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
      <nav className="mobile-nav">
        {nav
          .filter(([id]) =>
            ["dashboard", "tasks", "personal", "library", "records"].includes(
              id,
            ),
          )
          .map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              <span>
                {id === "dashboard"
                  ? "סקירה"
                  : id === "decisions"
                    ? "החלטות"
                    : id === "personal"
                      ? "אישי"
                      : id === "records"
                        ? "סיכומים"
                        : id === "domains"
                          ? "תחומים"
                          : label}
              </span>
            </button>
          ))}
      </nav>
      {taskActions.error && <div className="quick-notice" role="alert">{taskActions.error}<button onClick={()=>void load()}>רענון</button></div>}
      {taskActions.notice && <div className="quick-notice" role="status">{taskActions.notice}{taskActions.undo.length>0 && <button disabled={taskActions.busy} onClick={()=>void taskActions.cancel()}>ביטול פעולה</button>}</div>}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {modal && (
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
          {canWrite && <div className="rhythm-toolbar">
            <button className="button secondary" disabled={busy} onClick={() => void mutate(`/api/tasks/${task.id}`, "PATCH", {version:task.version, status:"in_progress"}, "המשימה סומנה לא בוצע")}>לא בוצע</button>
            {task.status !== "completed" && (task.creatorId === data.user.id || task.ownerId === data.user.id) && <button className="button primary" disabled={busy} onClick={() => void mutate(`/api/tasks/${task.id}`, "PATCH", {version:task.version, status:task.ownerId !== task.creatorId && task.creatorId !== data.user.id ? "pending_review" : "completed"}, "מצב הביצוע נשמר")}>{task.status === "pending_review" && task.creatorId === data.user.id ? "אישור ביצוע" : "בוצע"}</button>}
          </div>}
          {canWrite && (
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
                            status: f.get("status"),
                            blockerReason: f.get("blockerReason"),
                          }),
                    },
                    "פרטי המשימה עודכנו",
                  );
                }}
              >
                {manager && (
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
                  {manager && (
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
                      <label>
                        אחראי לביצוע
                        <select name="ownerId" defaultValue={task.ownerId}>
                          {data.users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        מועד סיום
                        <input
                          name="dueDate"
                          type="date"
                          defaultValue={task.dueDate || ""}
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
            {canWrite && (
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
