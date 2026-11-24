"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Inbox, X } from "lucide-react";
import {contextMenuPosition} from "@/lib/context-menu-position";
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
  actionSheet = false,
  contextAnchor = null,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  actionSheet?: boolean;
  contextAnchor?: HTMLElement | null;
}) {
  const section = useRef<HTMLElement>(null),
    dirty = useRef(false),
    closeRef = useRef(close);
  const openingClickUntil=useRef(0);
  const highlight=useRef<HTMLDivElement>(null);
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
  useLayoutEffect(() => {
    const dialog=section.current, spotlight=highlight.current;
    if(!mounted||!dialog||!spotlight||!contextAnchor)return;
    const backdrop=dialog.parentElement;
    const anchor=contextAnchor;
    const visible=window.visualViewport;
    const clear=()=>{
      backdrop?.classList.remove('document-context-anchored');
      [dialog,spotlight].forEach(node=>['left','top','width','height','max-height'].forEach(property=>node.style.removeProperty(property)));
    };
    const locate=()=>{
      const x=visible?.offsetLeft??0,y=visible?.offsetTop??0;
      const viewport={left:x,top:y,right:x+(visible?.width??window.innerWidth),bottom:y+(visible?.height??window.innerHeight)};
      const source=anchor.getBoundingClientRect();
      const rect={left:Math.max(viewport.left,source.left),top:Math.max(viewport.top,source.top),
        right:Math.min(viewport.right,source.right),bottom:Math.min(viewport.bottom,source.bottom)};
      for(let parent=anchor.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
        const css=getComputedStyle(parent);
        if(!/(auto|scroll|hidden|clip)/.test(css.overflow+css.overflowX+css.overflowY))continue;
        const bounds=parent.getBoundingClientRect();
        if(bounds.width>0&&/(auto|scroll|hidden|clip)/.test(css.overflowX||css.overflow)){rect.left=Math.max(rect.left,bounds.left);rect.right=Math.min(rect.right,bounds.right);}
        if(bounds.height>0&&/(auto|scroll|hidden|clip)/.test(css.overflowY||css.overflow)){rect.top=Math.max(rect.top,bounds.top);rect.bottom=Math.min(rect.bottom,bounds.bottom);}
      }
      if(!anchor.isConnected||rect.right<=rect.left||rect.bottom<=rect.top){clear();return;}
      backdrop?.classList.add('document-context-anchored');
      const px=(value:number)=>`${value}px`;
      Object.assign(spotlight.style,{left:px(rect.left),top:px(rect.top),width:px(rect.right-rect.left),height:px(rect.bottom-rect.top)});
      dialog.style.width=px(contextMenuPosition(rect,viewport,0).width);
      dialog.style.maxHeight=px(Math.max(0,viewport.bottom-viewport.top-24));
      const position=contextMenuPosition(rect,viewport,dialog.scrollHeight+2);
      Object.assign(dialog.style,{left:px(position.left),top:px(position.top),maxHeight:px(position.maxHeight)});
    };
    locate();
    anchor.classList.add('document-context-lifted');
    window.addEventListener('resize',locate);window.addEventListener('scroll',locate);
    visible?.addEventListener('resize',locate);visible?.addEventListener('scroll',locate);
    return ()=>{
      clear();anchor.classList.remove('document-context-lifted');
      window.removeEventListener('resize',locate);window.removeEventListener('scroll',locate);
      visible?.removeEventListener('resize',locate);visible?.removeEventListener('scroll',locate);
    };
  },[contextAnchor,mounted]);
  useEffect(() => {
    if (!mounted || !section.current) return;
    const dialog = section.current;
    openingClickUntil.current=Date.now()+400;
    const focused = document.activeElement as HTMLElement | null;
    const nearAnchor=contextAnchor?.contains(focused)||focused?.parentElement===contextAnchor?.parentElement;
    const previousFocus=contextAnchor&&!nearAnchor?
      contextAnchor.querySelector<HTMLElement>('button:not(:disabled)')??contextAnchor:focused;
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
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({preventScroll:true});
    };
  }, [contextAnchor,mounted]);
  if (!mounted) return null;
  return createPortal(
    <div
      className={"modal-backdrop"+(actionSheet?" document-context-backdrop":"")}
      onPointerDownCapture={()=>{openingClickUntil.current=0;}}
      onClickCapture={e=>{
        // The same release that opened a touch menu must not hit the backdrop
        // or an option. A genuine next pointerdown or keyboard click is allowed.
        if((actionSheet||contextAnchor)&&e.detail!==0&&Date.now()<openingClickUntil.current){e.preventDefault();e.stopPropagation();}
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      {contextAnchor&&<div aria-hidden="true" ref={highlight} className="document-context-spotlight"/>}
      <section
        ref={section}
        className={"modal"+(wide?" wide":"")+(actionSheet?" document-context-sheet":"")}
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
