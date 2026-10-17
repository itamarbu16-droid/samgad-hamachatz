"use client";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/workspace-primitives";
import { ArrowLeft } from "lucide-react";
export default function LoginScreen({deputies=false}:{deputies?:boolean}) {
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
          rememberMe: true,
        }),
      });
      if (!r.ok) {
        const failure = await r.json().catch(() => ({}));
        throw Error(r.status === 403 ? failure.error || "אין הרשאת כניסה למייל הזה" : "כתובת האימייל או הסיסמה אינן תקינות. נסו שוב.");
      }
      const workspace = await fetch('/api/workspace', { cache: 'no-store' });
      const identity = await workspace.json();
      if (!workspace.ok) throw Error(identity.error || 'אין הרשאת כניסה למרחב');
      window.location.href = identity.user.permissions?.manageAccess ? '/' : '/deputies';
    } catch (e) {
      setError(e instanceof Error ? e.message : "הכניסה לא הצליחה");
      setBusy(false);
    }
  }
  return (
    <main className="login-screen battalion-login">
      <div className="login-art" role="img" aria-label="סמל גדוד 605 — ברמה אחרת" />
      <div className="login-entry" hidden={showForm}>
        <h1 className="login-app-name">{deputies ? "סגני המחץ" : "סמג״ד המחץ"}</h1>
        <button className="button primary" onClick={() => setShowForm(true)}>כניסה למערכת <ArrowLeft size={25}/></button>
        <p className="login-note">כניסה למיילים שאושרו על ידי מנהל המערכת בלבד</p>
      </div>
      {showForm && <Modal title="כניסה למרחב העבודה" close={()=>setShowForm(false)}>
      <section className="login-form">
        <div>
          <span className="eyebrow">טוב לראות אותך</span>

          <p className="muted">הזינו את פרטי החשבון שהוקצו לכם.</p>
          <form onSubmit={submit}>
            <label>
              אימייל
              <input
                name="email"
                type="email"
                dir="ltr"
                autoComplete="username"
                required
                placeholder="name@example.com"
              />
            </label>
            <label>
              סיסמה
              <input
                name="password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "מתבצעת כניסה…" : "כניסה למערכת"}
              <ArrowLeft size={17} />
            </button>
          </form>
          
          <p className="login-note">
            הגישה והמידע הזמין נקבעים לפי הרשאות החשבון.
          </p>
        </div>
      </section>
      </Modal>}
    </main>
  );
}
