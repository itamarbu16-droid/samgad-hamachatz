"use client";

import { Bell, CheckCheck, House, LibraryBig, Menu, NotebookPen, Plus, RefreshCw, Search, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { Modal } from "./workspace-primitives";
import { PushSettings } from "./push-settings";
import {ManualDevicePrompt} from "./manual-device-prompt";

type NavigationItem = readonly [id: string, label: string, icon: LucideIcon];
const primaryItems = [
  ["records", "סיכומי ישיבות", NotebookPen],
  ["tasks", "משימות", CheckCheck],
  ["dashboard", "ראשי", House],
  ["library", "ספרייה", LibraryBig],
] as const;
const primaryViews = new Set<string>(primaryItems.map(([id]) => id));
const formatDay = new Intl.DateTimeFormat("he-IL", { weekday:"long", day:"numeric", month:"long", timeZone:"Asia/Jerusalem" });

export function WorkspaceHomeHeader({ owner, today, userName, demo, canCapture, hasUpdates, onActivity, onSearch, onCapture }: {
  owner: boolean; today: string; userName?: string; demo: boolean; canCapture: boolean; hasUpdates: boolean;
  onActivity: () => void; onSearch: () => void; onCapture: () => void;
}) {
  const day = new Date(today + "T12:00:00Z");
  return <header className="workspace-masthead">
    <div className="workspace-masthead-title">
      <span className="workspace-masthead-emblem" aria-hidden="true" />
      <div><h1>{owner ? "סמג״ד המחץ" : "סגני המחץ"}</h1>
      {!owner && userName ? <span className="workspace-home-account">{userName}</span> : Number.isFinite(day.valueOf()) && <time dateTime={today}>{formatDay.format(day)}</time>}
      {demo && <span className="workspace-demo"> · הדגמה</span>}</div>
    </div>
    <div className="workspace-masthead-tools">
      <button type="button" className="icon-button" aria-label="חיפוש בכל האפליקציה" onClick={onSearch}><Search size={20} aria-hidden="true" /></button>
      <button type="button" className="icon-button workspace-bell" aria-label={hasUpdates ? "עדכונים אחרונים, יש עדכונים" : "עדכונים אחרונים"} onClick={onActivity}><Bell size={20} aria-hidden="true" />{hasUpdates && <i aria-hidden="true" />}</button>
    </div>
    {canCapture && <button type="button" className="button primary workspace-home-add" aria-haspopup="dialog" onClick={onCapture}><Plus size={19} aria-hidden="true" /> הוספה מהירה</button>}
  </header>;
}

export function WorkspaceMobileNav({ view, moreOpen, onGo, onMore }: {
  view: string; moreOpen: boolean; onGo:(view:string)=>void; onMore:()=>void;
}) {
  return <nav className="mobile-nav" aria-label="ניווט ראשי">
    {primaryItems.map(([id,label,Icon]) => <button type="button" key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => onGo(id)}><Icon aria-hidden="true" size={22}/><span>{label}</span></button>)}
    <button type="button" className={!primaryViews.has(view) ? "active" : ""} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={onMore}><Menu aria-hidden="true" size={22}/><span>עוד</span></button>
  </nav>;
}

export function WorkspaceMore({ items, view, canManageAccess, onGo, onClose, onSearch, onRefresh, onLogin, manualDeviceAccount }: {
  items: readonly NavigationItem[]; view: string; canManageAccess:boolean; onGo:(view:string)=>void;
  onClose:()=>void; onSearch:()=>void; onRefresh:()=>void; onLogin:()=>void; manualDeviceAccount?:string;
}) {
  return <Modal title="עוד" close={onClose} actionSheet>
    <div className="more-navigation workspace-more">
      <button type="button" className="nav-item workspace-more-search" onClick={onSearch}><Search size={21} aria-hidden="true" />חיפוש בכל האפליקציה</button>
      <nav aria-label="מסכים נוספים" className="workspace-more-group">
        {items.filter(([id]) => !primaryViews.has(id)).map(([id,label,Icon]) => <button type="button" className={view===id?"nav-item active":"nav-item"} aria-current={view===id?"page":undefined} key={id} onClick={()=>onGo(id)}><Icon size={21} aria-hidden="true"/>{label}</button>)}
        {canManageAccess && <button type="button" aria-current={view==="access"?"page":undefined} className={view==="access"?"nav-item active":"nav-item"} onClick={()=>onGo("access")}><ShieldCheck size={21} aria-hidden="true"/>ניהול גישה</button>}
      </nav>
      <section className="workspace-more-group" aria-label="הגדרות המכשיר">
        <PushSettings/>
        {manualDeviceAccount&&<ManualDevicePrompt key={manualDeviceAccount} account={manualDeviceAccount} preferences/>}
        <button type="button" className="nav-item" onClick={onRefresh}><RefreshCw size={20} aria-hidden="true"/>רענון מידע</button>
        <button type="button" className="nav-item" onClick={onLogin}><UserRound size={20} aria-hidden="true"/>מסך כניסה</button>
      </section>
    </div>
  </Modal>;
}
