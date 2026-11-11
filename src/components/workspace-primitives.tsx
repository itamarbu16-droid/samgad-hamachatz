"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Inbox, X } from "lucide-react";
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={26} aria-hidden="true" />
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
const activeDialogs: HTMLElement[] = [];
const originalInert = new Map<HTMLElement, boolean>();
let originalOverflow = "";
function syncDialogBackground() {
  const topOverlay = activeDialogs.at(-1)?.parentElement;
  if (!topOverlay) {
    originalInert.forEach((inert, node) => { node.inert = inert; });
    originalInert.clear();
    document.body.style.overflow = originalOverflow;
    return;
  }
  for (const node of Array.from(document.body.children)) {
    if (!(node instanceof HTMLElement)) continue;
    if (!originalInert.has(node)) originalInert.set(node, node.inert);
    node.inert = node !== topOverlay;
  }
  document.body.style.overflow = "hidden";
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
  const [mounted, setMounted] = useState(false);
  const continueButton = useRef<HTMLButtonElement>(null);
  const editingFocus = useRef<HTMLElement | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (confirm) continueButton.current?.focus();
  }, [confirm]);
  closeRef.current = close;
  function dismiss() {
    if (dirty.current) {
      editingFocus.current = document.activeElement as HTMLElement | null;
      setConfirm(true);
    }
    else closeRef.current();
  }
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    if (!mounted || !section.current) return;
    const dialog = section.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!activeDialogs.length) originalOverflow = document.body.style.overflow;
    activeDialogs.push(dialog);
    syncDialogBackground();
    const focusable = () =>
      Array.from(
        section.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]',
        ) || [],
      ).filter((e) => e.getClientRects().length > 0);
    // Focus the sheet itself, avoiding an unsolicited software keyboard on iPhone.
    dialog.focus();
    const handle = (e: KeyboardEvent) => {
      if (activeDialogs.at(-1) !== dialog) return;
      if (e.key === "Escape") {
        e.preventDefault();
        dismissRef.current();
      }
      if (e.key === "Tab") {
        const list = focusable(),
          first = list[0],
          last = list[list.length - 1];
        if (!first) { e.preventDefault(); dialog.focus(); }
        else if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
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
      if (activeDialogs.at(-1) === dialog) dirty.current = false;
    };
    const requested = () => { if (activeDialogs.at(-1) === dialog) dismissRef.current(); };
    window.addEventListener("samgad:saved", saved);
    window.addEventListener("samgad:modal-dismiss", requested);
    document.addEventListener("keydown", handle);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("samgad:saved", saved);
      window.removeEventListener("samgad:modal-dismiss", requested);
      document.removeEventListener("keydown", handle);
      window.removeEventListener("beforeunload", unload);
      const index = activeDialogs.indexOf(dialog);
      if (index >= 0) activeDialogs.splice(index, 1);
      syncDialogBackground();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
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
        tabIndex={-1}
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
        {confirm && (
          <div className="modal-body">
            <h3>יש שינויים שלא נשמרו</h3>
            <p>סגירת החלון תבטל את השינויים שטרם נשמרו.</p>
            <div className="modal-actions">
              <button
                ref={continueButton}
                className="button primary"
                onClick={() => { setConfirm(false); requestAnimationFrame(() => editingFocus.current?.focus()); }}
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
        )}
        <div className="modal-body" hidden={confirm}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}
