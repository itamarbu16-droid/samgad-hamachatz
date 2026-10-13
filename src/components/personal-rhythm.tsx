"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Plus,
  RefreshCw,
  LockKeyhole,
  Users,
  CalendarDays,
  CheckCheck,
} from "lucide-react";
import { isPersonalItem } from "@/lib/unit-roles";
import { frequencies, type Frequency } from "@/lib/rhythm";
import { Modal, Empty } from "./workspace-primitives";

type Person = { id: string; name: string; email: string };
type Item = {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  assigneeIds: string[];
  important: boolean;
  manualUrgent: boolean;
  frequency: Frequency;
  completionMode: string;
  startDate: string;
  endDate: string | null;
  archived: boolean;
  version: number;
};
type Occurrence = {
  id: string;
  itemId: string;
  dueDate: string;
  done: boolean;
  urgent: boolean;
  version: number;
  completions: Record<string, string>;
  completedAt: string | null;
  completedBy: string | null;
};
type Group = { id: string; name: string; emails: string[]; version: number };
type Data = {
  today: string;
  month: string;
  mailConfigured: boolean;
  schedulerPreview: boolean;
  items: Item[];
  occurrences: Occurrence[];
  groups: Group[];
  people: Person[];
};
const splitEmails = (value: FormDataEntryValue | null) => [
  ...new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ),
];
const formatDate = (value: string) =>
  new Date(value + "T12:00:00Z").toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  });
export default function PersonalRhythm({
  userId,
  role,
  scope = "personal",
}: {
  userId: string;
  role: string;
  scope?: "personal" | "assigned";
}) {
  const [data, setData] = useState<Data | null>(null);
  const [month, setMonth] = useState(
    () =>
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("month")
        : null) ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
      }).format(new Date()),
  );
  const [tab, setTab] = useState("tasks"),
    [filter, setFilter] = useState("open"),
    [query, setQuery] = useState("");
  const [modal, setModal] = useState(""),
    [editingGroup, setEditingGroup] = useState<Group | null>(null),
    [editingItem, setEditingItem] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const requestIds = useRef(new Map<string, string>());
  const sequence = useRef(0);
  const manager = ["deputy", "staff", "company_commander"].includes(role),
    canWrite = manager || role === "contributor";
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/rhythm?month=${encodeURIComponent(month)}`,
        { cache: "no-store" },
      );
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "לא ניתן לטעון את המידע");
      if (current === sequence.current) {
        setData(value);
        setError("");
      }
    } catch (error) {
      if (current === sequence.current)
        setError(error instanceof Error ? error.message : "שגיאה בטעינה");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!data) return;
    const id = new URLSearchParams(window.location.search).get("occurrence");
    if (id)
      document
        .getElementById(`occurrence-${id}`)
        ?.scrollIntoView({ block: "center" });
  }, [data]);
  async function mutate(url: string, method: string, body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    const key = url + JSON.stringify(body);
    if (method === "POST" && !requestIds.current.has(key))
      requestIds.current.set(key, crypto.randomUUID());
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          method === "POST"
            ? { ...body, clientRequestId: requestIds.current.get(key) }
            : body,
        ),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "השינוי לא נשמר");
      requestIds.current.delete(key);
      window.dispatchEvent(new Event("samgad:saved"));
      await load();
      setNotice("השינוי נשמר");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "השינוי לא נשמר");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      !editingItem &&
      scope === "assigned" &&
      splitEmails(form.get("emails")).length === 0 &&
      form.getAll("groupIds").length === 0
    ) {
      setError("יש לבחור בעל תפקיד, קבוצה או מייל לשיוך המשימה");
      return;
    }
    const common = {
      title: String(form.get("title")),
      description: String(form.get("description") || ""),
      important: form.has("important"),
      manualUrgent: form.has("manualUrgent"),
    };
    const success = editingItem
      ? await mutate(`/api/rhythm/items/${editingItem.id}`, "PATCH", {
          ...common,
          version: editingItem.version,
        })
      : await mutate("/api/rhythm/items", "POST", {
          ...common,
          startDate: form.get("startDate"),
          endDate: form.get("endDate") || null,
          frequency: form.get("frequency"),
          completionMode: form.get("completionMode") || "individual",
          emails: splitEmails(form.get("emails")),
          groupIds: form.getAll("groupIds"),
        });
    if (success) {
      setModal("");
      setEditingItem(null);
    }
  }
  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await mutate(
        editingGroup
          ? `/api/rhythm/groups/${editingGroup.id}`
          : "/api/rhythm/groups",
        editingGroup ? "PATCH" : "POST",
        {
          name: String(form.get("name")),
          emails: splitEmails(form.get("emails")),
          ...(editingGroup ? { version: editingGroup.version } : {}),
        },
      )
    ) {
      setModal("");
      setEditingGroup(null);
    }
  }
  if (!data)
    return (
      <section className="panel rhythm-state">
        <p>{loading ? "טוענים את המרחב האישי…" : error}</p>
        <button
          className="button secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          ניסיון נוסף
        </button>
      </section>
    );
  const person = (id: string) =>
    data.people.find((person) => person.id === id)?.name || "בעל תפקיד";
  const records = data.occurrences
    .map((occurrence) => ({
      occurrence,
      item: data.items.find((item) => item.id === occurrence.itemId)!,
    }))
    .filter(({ item }) =>
      scope === "personal"
        ? isPersonalItem(item, userId)
        : !isPersonalItem(item, userId),
    );
  const active = records.filter(
    ({ occurrence, item }) => !item.archived && !occurrence.done,
  );
  const visible = records.filter(({ occurrence, item }) => {
    if (
      item.archived ||
      (tab === "rhythm" &&
        (item.frequency === "once" || !occurrence.dueDate.startsWith(month)))
    )
      return false;
    if (
      query &&
      !`${item.title} ${item.description} ${item.assigneeIds.map(person).join(" ")}`.includes(
        query,
      )
    )
      return false;
    if (filter === "urgent") return occurrence.urgent;
    if (filter === "important") return item.important;
    if (filter === "mine") return item.assigneeIds.includes(userId);
    if (filter === "private")
      return (
        item.creatorId === userId &&
        item.assigneeIds.length === 1 &&
        item.assigneeIds[0] === userId
      );
    if (filter === "assigned")
      return (
        item.creatorId === userId &&
        item.assigneeIds.some((id) => id !== userId)
      );
    if (filter === "completed") return occurrence.done;
    return filter !== "open" || !occurrence.done;
  });
  const focusedId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("occurrence")
      : null;
  return (
    <div className="rhythm-workspace">
      <div className="rhythm-tabs" role="group" aria-label="תצוגת המרחב האישי">
        {[
          [
            "tasks",
            scope === "personal" ? "משימות אישיות" : "שיוכים וביצוע",
            CheckCheck,
          ],
          ...(scope === "personal"
            ? [["rhythm", "שעל״ל — שעון לחימה", CalendarDays]]
            : []),
          ...(manager && scope === "assigned"
            ? [["groups", "בעלי תפקידים וקבוצות", Users]]
            : []),
        ].map(([id, label, Icon]) => {
          const TabIcon = Icon as typeof Users;
          return (
            <button
              key={String(id)}
              className={tab === id ? "button primary" : "button secondary"}
              onClick={() => {
                setTab(String(id));
                setFilter(id === "rhythm" ? "all" : "open");
              }}
            >
              <TabIcon size={17} />
              {String(label)}
            </button>
          );
        })}
      </div>
      <div className="rhythm-summary">
        <span>
          <strong>{active.length}</strong> פתוחות
        </span>
        <span className="late">
          <strong>
            {active.filter((row) => row.occurrence.urgent).length}
          </strong>{" "}
          דחופות
        </span>
        <span>
          <strong>{active.filter((row) => row.item.important).length}</strong>{" "}
          חשובות
        </span>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rhythm-notice">
          {notice}
        </p>
      )}
      {scope === "assigned" && data.schedulerPreview && (
        <p className="rhythm-info">
          זו סביבת תצוגה מקדימה. תזכורות ברקע דורשות מתזמן חיצוני; התזמון של
          Vercel פועל בגרסה המפורסמת.
        </p>
      )}
      {scope === "assigned" && !data.mailConfigured && (
        <p className="rhythm-info">
          התראות מייל ממתינות לחיבור שירות הדואר והפעלת התזמון.
        </p>
      )}
      {tab === "groups" ? (
        <>
          <div className="rhythm-toolbar">
            <p>בעל תפקיד יכול לכלול מייל אחד; קבוצה יכולה לכלול כמה מיילים.</p>
            <button
              className="button primary"
              onClick={() => {
                setEditingGroup(null);
                setModal("group");
              }}
            >
              <Plus size={17} />
              הוספת בעל תפקיד / קבוצה
            </button>
          </div>
          <div className="rhythm-group-grid">
            {data.groups.map((group) => (
              <section className="panel rhythm-group" key={group.id}>
                <h2>{group.name}</h2>
                {group.emails.map((email) => (
                  <p dir="ltr" key={email}>
                    {email}
                  </p>
                ))}
                <button
                  className="button secondary"
                  onClick={() => {
                    setEditingGroup(group);
                    setModal("group");
                  }}
                >
                  עריכת מיילים
                </button>
                <small>
                  שינוי הקבוצה יחול על שיוכים חדשים. משימות שכבר נוצרו שומרות את
                  המשויכים שלהן.
                </small>
              </section>
            ))}
          </div>
          {!data.groups.length && (
            <Empty>הוסף בעלי תפקידים וקבוצות לשיוך מהיר של משימות.</Empty>
          )}
        </>
      ) : (
        <>
          <div className="rhythm-toolbar">
            <label>
              {tab === "rhythm" ? "חודש" : "הצג מופעים עד חודש"}
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                required
              />
            </label>
            <label>
              חיפוש
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="משימה או בעל תפקיד"
              />
            </label>
            <label>
              סינון
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                {Object.entries({
                  all: "הכול",
                  open: "פתוחות",
                  urgent: "דחופות",
                  important: "חשובות",
                  mine: "משויכות אליי",
                  ...(scope === "personal" ? { private: "פרטיות שלי" } : {}),
                  completed: "הושלמו",
                }).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              aria-label="רענון המרחב האישי"
              onClick={() => void load()}
              disabled={busy || loading}
            >
              <RefreshCw size={17} />
            </button>
            {canWrite && (
              <button
                className="button primary"
                onClick={() => {
                  setEditingItem(null);
                  setModal(tab === "rhythm" ? "recurring" : "item");
                }}
              >
                <Plus size={17} />
                {tab === "rhythm" ? "הוספת פעולה חוזרת" : "הוספת משימה"}
              </button>
            )}
          </div>
          {tab === "rhythm" && (
            <p className="rhythm-info">
              כל שורה היא מופע נפרד. אפשר לחזור לחודש קודם ולסמן ביצוע. שבוע
              לפני סוף החודש, פעולות שמועדן הגיע ולא בוצעו מוצגות בדחופות.
            </p>
          )}
          <section className="panel rhythm-table-wrap" aria-busy={loading}>
            {visible.length ? (
              <table className="rhythm-table">
                <caption>
                  {tab === "rhythm"
                    ? `שעון לחימה — ${month}`
                    : "משימות אישיות ומשויכות — כולל משימות באיחור"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">המשימה</th>
                    <th scope="col">תדירות</th>
                    <th scope="col">תג״ב</th>
                    <th scope="col">חשיבות ודחיפות</th>
                    <th scope="col">ביצוע ✓</th>
                    <th scope="col">ניהול</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ occurrence, item }) => (
                    <tr
                      id={`occurrence-${occurrence.id}`}
                      key={occurrence.id}
                      className={
                        focusedId === occurrence.id
                          ? "rhythm-highlight"
                          : occurrence.urgent
                            ? "rhythm-urgent"
                            : ""
                      }
                    >
                      <td>
                        <strong>{item.title}</strong>
                        {item.description && <small>{item.description}</small>}
                        <small>
                          {item.assigneeIds.length === 1 &&
                          item.assigneeIds[0] === item.creatorId ? (
                            <>
                              <LockKeyhole size={12} /> פרטי
                            </>
                          ) : (
                            `משויך · ${person(item.creatorId)}`
                          )}
                        </small>
                      </td>
                      <td>{frequencies[item.frequency]}</td>
                      <td
                        className={
                          occurrence.dueDate < data.today && !occurrence.done
                            ? "late"
                            : ""
                        }
                      >
                        {formatDate(occurrence.dueDate)}
                        {occurrence.dueDate < data.today &&
                          !occurrence.done && <small>באיחור</small>}
                      </td>
                      <td>
                        {item.important && (
                          <span className="badge high">חשוב</span>
                        )}
                        {occurrence.urgent && (
                          <span className="badge urgent">דחוף</span>
                        )}
                        {!item.important && !occurrence.urgent && (
                          <span className="muted">רגיל</span>
                        )}
                      </td>
                      <td>
                        {item.completionMode === "shared" ? (
                          <>
                            <label className="rhythm-check">
                              <input
                                type="checkbox"
                                aria-label={`ביצוע משותף: ${item.title} ${occurrence.dueDate}`}
                                checked={Boolean(occurrence.completedAt)}
                                disabled={busy || !canWrite}
                                onChange={(event) =>
                                  void mutate(
                                    `/api/rhythm/occurrences/${occurrence.id}`,
                                    "PATCH",
                                    {
                                      version: occurrence.version,
                                      done: event.target.checked,
                                      recipientId: item.assigneeIds.includes(
                                        userId,
                                      )
                                        ? userId
                                        : item.assigneeIds[0],
                                    },
                                  )
                                }
                              />
                              ביצוע משותף
                            </label>
                            <small>
                              {item.assigneeIds.map(person).join(", ")}
                            </small>
                            {occurrence.completedBy && (
                              <small>
                                בוצע על ידי {person(occurrence.completedBy)} ·{" "}
                                {formatDate(
                                  occurrence.completedAt!.slice(0, 10),
                                )}
                              </small>
                            )}
                          </>
                        ) : (
                          item.assigneeIds.map((id) => (
                            <label className="rhythm-check" key={id}>
                              <input
                                type="checkbox"
                                aria-label={`בוצע: ${item.title} ${occurrence.dueDate} ${person(id)}`}
                                checked={Boolean(occurrence.completions[id])}
                                disabled={
                                  busy ||
                                  !canWrite ||
                                  (id !== userId && item.creatorId !== userId)
                                }
                                onChange={(event) =>
                                  void mutate(
                                    `/api/rhythm/occurrences/${occurrence.id}`,
                                    "PATCH",
                                    {
                                      version: occurrence.version,
                                      done: event.target.checked,
                                      recipientId: id,
                                    },
                                  )
                                }
                              />
                              {person(id)}
                              {occurrence.completions[id] && (
                                <small>
                                  {formatDate(
                                    occurrence.completions[id].slice(0, 10),
                                  )}
                                </small>
                              )}
                            </label>
                          ))
                        )}
                      </td>
                      <td>
                        {item.creatorId === userId && canWrite && (
                          <>
                            <button
                              className="button secondary"
                              onClick={() => {
                                setEditingItem(item);
                                setModal("edit");
                              }}
                            >
                              עריכה
                            </button>
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() =>
                                void mutate(
                                  `/api/rhythm/items/${item.id}`,
                                  "PATCH",
                                  { version: item.version, archived: true },
                                )
                              }
                            >
                              ארכוב
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>
                {loading ? "טוענים…" : "אין משימות התואמות לתצוגה שבחרת."}
              </Empty>
            )}
          </section>
          {data.items.some(
            (item) =>
              item.archived &&
              item.creatorId === userId &&
              (scope === "personal"
                ? isPersonalItem(item, userId)
                : !isPersonalItem(item, userId)),
          ) && (
            <details className="panel rhythm-archive">
              <summary>משימות בארכיון והיסטוריית ביצוע</summary>
              {data.items
                .filter(
                  (item) =>
                    item.archived &&
                    item.creatorId === userId &&
                    (scope === "personal"
                      ? isPersonalItem(item, userId)
                      : !isPersonalItem(item, userId)),
                )
                .map((item) => (
                  <div key={item.id}>
                    <strong>{item.title}</strong>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void mutate(`/api/rhythm/items/${item.id}`, "PATCH", {
                          version: item.version,
                          archived: false,
                        })
                      }
                    >
                      שחזור
                    </button>
                    <ul>
                      {data.occurrences
                        .filter((row) => row.itemId === item.id)
                        .map((row) => (
                          <li key={row.id}>
                            {formatDate(row.dueDate)} ·{" "}
                            {row.done ? "בוצע" : "לא הושלם"}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
            </details>
          )}
        </>
      )}
      {modal && (
        <Modal
          title={
            modal === "group"
              ? "בעל תפקיד / קבוצה"
              : editingItem
                ? "עריכת משימה"
                : modal === "recurring"
                  ? "פעולה חוזרת בשעון הלחימה"
                  : "משימה"
          }
          close={() => setModal("")}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {modal === "group" ? (
            <form onSubmit={submitGroup}>
              <label>
                שם בעל התפקיד או הקבוצה
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={editingGroup?.name}
                  placeholder="למשל סמ״פ א׳ או סמ״פים"
                />
              </label>
              <label>
                כתובות מייל
                <textarea
                  dir="ltr"
                  name="emails"
                  required
                  defaultValue={editingGroup?.emails.join("\n")}
                  placeholder="כתובת בכל שורה, או הפרדה בפסיקים"
                />
              </label>
              <p className="rhythm-info">
                ניתן לשייך חשבונות פעילים בארגון בלבד. יש להקים חשבון והרשאה
                לבעל תפקיד חדש לפני הוספתו.
              </p>
              <button className="button primary" disabled={busy}>
                שמירת בעל תפקיד / קבוצה
              </button>
            </form>
          ) : (
            <form onSubmit={submitItem}>
              <label>
                שם המשימה
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={editingItem?.title}
                />
              </label>
              <label>
                תיאור
                <textarea
                  name="description"
                  maxLength={5000}
                  defaultValue={editingItem?.description}
                />
              </label>
              <div className="rhythm-flags">
                <label className="rhythm-check">
                  <input
                    type="checkbox"
                    name="important"
                    defaultChecked={editingItem?.important}
                  />
                  חשוב
                </label>
                <label className="rhythm-check">
                  <input
                    type="checkbox"
                    name="manualUrgent"
                    defaultChecked={editingItem?.manualUrgent}
                  />
                  דחוף
                </label>
              </div>
              {!editingItem && (
                <>
                  <div className="form-grid">
                    <label>
                      תדירות
                      <select
                        name="frequency"
                        defaultValue={
                          modal === "recurring" ? "monthly" : "once"
                        }
                      >
                        {Object.entries(frequencies).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      תג״ב ראשון / מועד התחלה
                      <input
                        type="date"
                        name="startDate"
                        required
                        defaultValue={data.today}
                      />
                    </label>
                    <label>
                      מועד סיום החזרתיות (רשות)
                      <input type="date" name="endDate" />
                    </label>
                    <label>
                      אופן ביצוע
                      <select name="completionMode">
                        <option value="individual">כל משויך מבצע בנפרד</option>
                        <option value="shared">ביצוע אחד סוגר לכולם</option>
                      </select>
                    </label>
                  </div>
                  {manager && scope === "assigned" && (
                    <>
                      <label>
                        שיוך לפי מיילים (רשות)
                        <textarea
                          name="emails"
                          dir="ltr"
                          placeholder="כתובת בכל שורה, או בחירת בעלי תפקידים למטה"
                        />
                      </label>
                      {data.groups.length > 0 && (
                        <fieldset className="rhythm-group-picker">
                          <legend>שיוך לבעלי תפקידים / קבוצות</legend>
                          {data.groups.map((group) => (
                            <label className="rhythm-check" key={group.id}>
                              <input
                                type="checkbox"
                                name="groupIds"
                                value={group.id}
                              />
                              {group.name}
                            </label>
                          ))}
                        </fieldset>
                      )}
                      <details>
                        <summary>כתובות זמינות בארגון</summary>
                        {data.people.map((person) => (
                          <p key={person.id}>
                            {person.name} —{" "}
                            <span dir="ltr">{person.email}</span>
                          </p>
                        ))}
                      </details>
                    </>
                  )}
                  <p className="rhythm-info">
                    {scope === "personal"
                      ? "המשימה גלויה רק לך. יום לפני התג״ב היא תסומן אוטומטית כדחופה."
                      : "המשימה תופיע אצל בעלי התפקידים שבחרת, עם מעקב ביצוע לכל משויך."}
                  </p>
                </>
              )}
              <div className="modal-actions">
                <button className="button primary" disabled={busy}>
                  {busy ? "נשמר…" : "שמירת המשימה"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
