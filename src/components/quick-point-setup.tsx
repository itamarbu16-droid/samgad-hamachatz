'use client';
import { useEffect, useState } from 'react';

type Status = { active: boolean; expiresAt: string | null; lastUsedAt: string | null };
export default function QuickPointSetup() {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState('');
  const [token, setToken] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  useEffect(() => {
    setEndpoint(`${location.origin}/api/quick-points`);
    void fetch('/api/quick-points/setup', { cache: 'no-store' }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'יש להתחבר לאפליקציה');
      setStatus(result);
    }).catch(e => setError(e.message));
  }, []);
  async function mutate(method: 'POST' | 'DELETE') {
    if (busy) return;
    setBusy(true); setError(''); setCopied(false);
    try {
      const response = await fetch('/api/quick-points/setup', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(method === 'POST' ? { consent } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'לא ניתן להשלים את הפעולה');
      setToken(result.token || '');
      setStatus({ active: method === 'POST', expiresAt: result.expiresAt || null, lastUsedAt: null });
      setConsent(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'לא ניתן להשלים את הפעולה'); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`Bearer ${token}`); setCopied(true); }
    catch { setError('לא ניתן להעתיק אוטומטית. אפשר לסמן ולהעתיק את ההרשאה בשדה.'); }
  }
  return <main className="quick-point-setup">
    <a href="/?view=personal&tab=points">← חזרה לנקודות לעיסוק</a>
    <h1>הוסף נקודה מהאייפון</h1>
    <p>כפתור במסך הבית לכתיבה או להכתבה, וגם לשמירת טקסט דרך תפריט השיתוף. לאחר הגדרה חד־פעמית, קיצור הדרך שומר בלי לפתוח את האפליקציה.</p>
    {error && <p role="alert" className="quick-point-error">{error}</p>}
    {!status && !error && <p role="status">בודק הרשאה…</p>}
    {status && <section>
      <h2>הרשאה מוגבלת לקיצור הדרך</h2>
      <p>ההרשאה מאפשרת רק הוספת נקודות למרחב שלך, בלי לקרוא, לערוך או למחוק מידע. הנקודות גלויות גם לבעלי הרשאת עריכה מלאה, כמו נקודות שמוסיפים באפליקציה. תוקף ההרשאה 90 יום ואפשר לבטל אותה כאן בכל רגע.</p>
      {status.active && <p>הרשאה פעילה עד {new Date(status.expiresAt!).toLocaleDateString('he-IL')}.{status.lastUsedAt && ` שימוש אחרון: ${new Date(status.lastUsedAt).toLocaleString('he-IL')}.`}</p>}
      <label className="quick-point-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />אני מאשר ליצור הרשאה ולשמור אותה בקיצור הדרך באייפון שלי. לא אשתף את קיצור הדרך עם ההרשאה בתוכו.</label>
      <button className="button primary" disabled={!consent || busy} onClick={() => void mutate('POST')}>{status.active ? 'החלפת ההרשאה הקיימת' : 'יצירת הרשאה לקיצור הדרך'}</button>
      {status.active && <button className="button secondary" disabled={busy} onClick={() => void mutate('DELETE')}>ביטול ההרשאה</button>}
      {status.active && <p>החלפת ההרשאה מבטלת את הקוד הקודם מיד.</p>}
      {token && <div className="quick-point-secret">
        <label>הרשאה להעתקה לשדה Authorization בקיצור הדרך בלבד<input type="password" readOnly value={`Bearer ${token}`} dir="ltr" autoComplete="off" spellCheck={false} onFocus={e => e.target.select()} /></label>
        <button className="button secondary" onClick={() => void copy()}>{copied ? 'הועתקה' : 'העתקת ההרשאה'}</button>
        <p>מוצגת רק עכשיו. אל תשלח אותה בצ׳אט או בצילום מסך. קיצורי דרך עשויים להסתנכרן למכשירי Apple שלך בהתאם להגדרות iCloud.</p>
      </div>}
    </section>}
    <section>
      <h2>הגדרה חד־פעמית ב״קיצורים״</h2>
      <p>זהו ניסיון ראשוני עם הגדרה ידנית, לא קובץ קיצור דרך מותקן. שמות הפעולות עשויים להשתנות לפי שפת וגרסת iOS.</p>
      <ol>
        <li>פתח ״קיצורים״, צור קיצור חדש בשם ״הוסף נקודה״. בפרטים הפעל ״הצג בגיליון השיתוף״ ובחר קלט מסוג טקסט וכתובות URL.</li>
        <li>הוסף תנאי: אם ״קלט קיצור הדרך״ מכיל ערך, קבל ממנו טקסט. אחרת, הוסף ״בקש קלט״ מסוג טקסט עם השאלה ״מה להוסיף לנקודות לעיסוק?״. אפשר להכתיב באמצעות המיקרופון במקלדת. שמור את התוצאה כמשתנה בשם ״נקודה״.</li>
        <li>הוסף ״הצג התראה״ להצגת ״נקודה״ עם כפתור ביטול, כדי לבדוק את הטקסט לפני שליחתו. אחריה הוסף ״תאריך נוכחי״ ואז ״עיצוב תאריך״, בפורמט מותאם yyyyMMddHHmmssSSS, ושמור כמשתנה ״מזהה בקשה״.</li>
        <li>הוסף ״קבל תוכן של כתובת URL״. כתובת:<input aria-label="כתובת שמירת נקודה" readOnly dir="ltr" value={endpoint} onFocus={e => e.target.select()} />שיטה POST. בכותרות הוסף Authorization עם ההרשאה שהעתקת כאן, ו־Content-Type עם הערך application/json.</li>
        <li>גוף הבקשה מסוג JSON, עם שני שדות טקסט: text = המשתנה ״נקודה״; clientRequestId = המשתנה ״מזהה בקשה״. השתמש בשדות JSON של הפעולה, לא בהדבקת הטקסט בתוך מחרוזת JSON.</li>
        <li>קרא את השדה saved בתוצאה. רק אם הוא true, הצג ״הנקודה נשמרה״. אחרת הצג את השדה error. בשגיאת רשת אל תציג הודעת הצלחה.</li>
        <li>בתפריט הקיצור בחר ״הוסף למסך הבית״. בהרצה הראשונה iOS עשוי לבקש לאפשר לקיצור להתחבר לכתובת האפליקציה.</li>
      </ol>
      <h2>העברת הודעה מוואטסאפ</h2>
      <p>אם ההודעה מציעה ״שתף״ דרך גיליון השיתוף של iOS, בחר ״הוסף נקודה״. ״העבר״ בתוך וואטסאפ שולח לשיחות בוואטסאפ ואינו מפעיל את הקיצור. אם אין שיתוף טקסט: העתק את ההודעה, לחץ על הכפתור במסך הבית והדבק בשדה. אין קריאה אוטומטית של שיחות.</p>
      <p>הניסיון תומך בטקסט בלבד, עד 5,000 תווים. תמונות, קבצים והודעות קוליות אינם מפוענחים. שמור רק תוכן שמותר לשמור באפליקציה.</p>
    </section>
  </main>;
}
