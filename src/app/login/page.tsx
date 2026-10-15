"use client";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck, Layers3 } from "lucide-react";
export default function Login() {
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
      if (!r.ok) throw Error("כתובת האימייל או הסיסמה אינן תקינות. נסו שוב.");
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "הכניסה לא הצליחה");
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={27} />
          </span>
          <div>
            סמג״ד המחץ<small>בהירות. אחריות. עשייה.</small>
          </div>
        </div>
        <div>
          <span className="eyebrow">ניהול מנהלתי, במקום אחד</span>
          <h1>
            כל האחריות.
            <br />
            תמונה אחת ברורה.
          </h1>
          <p>
            משימות, החלטות ואנשים — כדי לדעת מה דורש תשומת לב, ומה הצעד הבא.
          </p>
        </div>
        <span className="login-security">
          <ShieldCheck size={18} /> סביבת הדגמה עם מידע סינתטי בלבד
        </span>
      </section>
      <section className="login-form">
        <div>
          <span className="eyebrow">טוב לראות אותך</span>
          <h2>כניסה למרחב העבודה</h2>
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
          <p><a href="/">המשך לצפייה בלבד</a></p>
          <p className="login-note">
            הגישה והמידע הזמין נקבעים לפי הרשאות החשבון.
          </p>
        </div>
      </section>
    </main>
  );
}
