"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCheck, X } from "lucide-react";
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <CheckCheck size={26} />
      <p>{children}</p>
    </div>
  );
}
export function PanelHeading({
  title,
  count,
  action,
  onClick,
}: {
  title: string;
  count?: number;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="panel-heading">
      <h2>
        {title}
        {count !== undefined && <span>{count}</span>}
      </h2>
      {action && (
        <button onClick={onClick}>
          {action}
          <ArrowLeft size={14} />
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const section = useRef<HTMLElement>(null),
    dirty = useRef(false),
    closeRef = useRef(close);
  const [confirm, setConfirm] = useState(false);
  closeRef.current = close;
  function dismiss() {
    if (dirty.current) setConfirm(true);
    else closeRef.current();
  }
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        section.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]',
        ) || [],
      ).filter((e) => e.getClientRects().length > 0);
    const initial = section.current?.querySelector<HTMLElement>(
      "input,textarea,select",
    );
    (initial || focusable()[0])?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissRef.current();
      }
      if (e.key === "Tab") {
        const list = focusable(),
          first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    const saved = () => {
      dirty.current = false;
    };
    const requested = () => dismissRef.current();
    window.addEventListener("samgad:saved", saved);
    window.addEventListener("samgad:modal-dismiss", requested);
    document.addEventListener("keydown", handle);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("samgad:saved", saved);
      window.removeEventListener("samgad:modal-dismiss", requested);
      document.removeEventListener("keydown", handle);
      window.removeEventListener("beforeunload", unload);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <section
        ref={section}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onChange={() => {
          dirty.current = true;
        }}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={dismiss} aria-label="סגירה">
            <X size={21} />
          </button>
        </div>
        {confirm ? (
          <div className="modal-body">
            <h3>יש שינויים שלא נשמרו</h3>
            <p>סגירת החלון תבטל את השינויים שטרם נשמרו.</p>
            <div className="modal-actions">
              <button
                className="button primary"
                onClick={() => setConfirm(false)}
              >
                המשך עריכה
              </button>
              <button
                className="button secondary"
                onClick={() => closeRef.current()}
              >
                סגירה ללא שמירה
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body">{children}</div>
        )}
      </section>
    </div>
  );
}
