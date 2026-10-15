"use client";

import { useState, type FormEvent } from "react";
import { frequencies } from "@/lib/rhythm";
export type Person = {
  id: string;
  name: string;
  email: string;
};
export type Item = {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  assigneeIds: string[];
  category: string;
  hasDeadline: boolean;
  frequency: keyof typeof frequencies;
  startDate: string;
  endDate: string | null;
  completionMode: string;
  important: boolean;
  manualUrgent: boolean;
  archived: boolean;
  version: number;
};
export type Occurrence = {
  id: string;
  itemId: string;
  dueDate: string;
  done: boolean;
  urgent: boolean;
  version: number;
  completions: Record<string, string>;
  reports: Record<string, string>;
  completedAt: string | null;
  completedBy: string | null;
};
export type RhythmData = {
  today: string;
  month: string;
  items: Item[];
  occurrences: Occurrence[];
  groups: {
    id: string;
    name: string;
    emails: string[];
    version: number;
  }[];
  people: Person[];
};
export function TaskComposer({
  data,
  userId,
  role,
  item,
  point = false,
  convert = false,
  recurring = false,
  busy,
  onSave
}: {
  data: RhythmData;
  userId: string;
  role: string;
  item?: Item;
  point?: boolean;
  convert?: boolean;
  recurring?: boolean;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [recipients, setRecipients] = useState<string[]>(item?.assigneeIds || [userId]);
  const [frequency, setFrequency] = useState(item?.frequency || (recurring ? "monthly" : "once"));
  const manager = ["deputy", "staff", "company_commander"].includes(role);
  const isPoint = point && !convert;
  const toggle = (id: string) => setRecipients(ids => ids.includes(id) ? ids.filter(x => x !== id) : ids.length === 1 && ids[0] === userId && id !== userId ? [id] : [...ids, id]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("startDate") || "");
    const common = {
      title: String(form.get("title")),
      description: String(form.get("description") || ""),
      important: form.has("important"),
      manualUrgent: form.has("manualUrgent"),
      recipientIds: isPoint ? [userId] : recipients,
      category: isPoint ? "point" : "task",
      hasDeadline: !isPoint && (frequency !== "once" || Boolean(date)),
      ...(!item || item.frequency === "once" ? {
        startDate: date || data.today
      } : {})
    };
    await onSave(item ? {
      ...common,
      version: item.version
    } : {
      ...common,
      frequency: isPoint ? "once" : frequency,
      endDate: form.get("endDate") || null,
      completionMode: form.get("completionMode") || "individual"
    });
  }
  return <form onSubmit={submit} className="quick-task-form">
    <label>{isPoint ? "נקודה לעיסוק" : "שם המשימה"}<input name="title" required minLength={2} maxLength={160} defaultValue={item?.title} autoFocus placeholder="מה צריך לעשות?" /></label>
    {!isPoint && <>
      {manager && <fieldset className="role-chips"><legend>אחראי — ללא בחירה המשימה נשארת אצלך</legend>
        {data.people.map(person => <button key={person.id} type="button" className={recipients.includes(person.id) ? "button primary" : "button secondary"} aria-pressed={recipients.includes(person.id)} onClick={() => toggle(person.id)}>{person.id === userId ? "אני" : person.name}</button>)}
        {data.groups.filter(g => g.emails.length > 1).map(group => <button key={group.id} type="button" className="button secondary" onClick={() => setRecipients([...new Set(data.people.filter(p => group.emails.includes(p.email)).map(p => p.id))])}>{group.name}</button>)}
      </fieldset>}
      <label>{frequency === "once" ? "מועד סיום — רשות" : "מועד התחלה"}<input type="date" name="startDate" defaultValue={item?.hasDeadline || frequency !== "once" ? item?.startDate || data.today : ""} disabled={Boolean(item && item.frequency !== "once")} /></label>
    </>}
    <details open={Boolean(item?.description || item?.important || item?.manualUrgent || recurring)}>
      <summary>פרטים נוספים — הכול לבחירה</summary>
      <label>תיאור<textarea name="description" maxLength={5000} defaultValue={item?.description} /></label>
      {!isPoint && <>
        <div className="rhythm-flags"><label><input type="checkbox" name="important" defaultChecked={item?.important} /> חשוב</label><label><input type="checkbox" name="manualUrgent" defaultChecked={item?.manualUrgent} /> דחוף</label></div>
        {!item && <><label>חזרה על המשימה<select name="frequency" value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)}>{Object.entries(frequencies).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          {frequency !== "once" && <label>סיום החזרתיות — רשות<input type="date" name="endDate" /></label>}
          <label>ביצוע למספר אחראים<select name="completionMode"><option value="individual">כל אחראי בנפרד</option><option value="shared">ביצוע אחד לכולם</option></select></label></>}
      </>}
    </details>
    <button className="button primary" disabled={busy}>{busy ? "נשמר…" : convert ? "הפיכה למשימה" : isPoint ? "שמירת נקודה" : "שמירת המשימה"}</button>
  </form>;
}
