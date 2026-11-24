// @vitest-environment happy-dom
import React, {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {CheckCheck, CalendarDays, UserRound} from "lucide-react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {WorkspaceHomeHeader,WorkspaceMobileNav,WorkspaceMore} from "../src/components/workspace-navigation";

vi.mock("../src/components/push-settings",()=>({PushSettings:()=>null}));
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
let host: HTMLDivElement, root: Root;
beforeEach(()=>{host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click=async (button:HTMLElement)=>{await act(async()=>button.click());};
const button=(name:string,scope:ParentNode=document)=>Array.from(scope.querySelectorAll("button")).find(node=>node.textContent?.trim()===name||node.getAttribute("aria-label")===name);
const noop=()=>{};

it("home has one explicit add action only for the same eligible roles and keeps global search",async()=>{
 const onCapture=vi.fn(),onSearch=vi.fn(),onActivity=vi.fn();
 const header=(owner:boolean,canCapture:boolean)=><WorkspaceHomeHeader owner={owner} today="2026-11-24" demo={false} canCapture={canCapture} hasUpdates={true} onCapture={onCapture} onSearch={onSearch} onActivity={onActivity}/>;
 await act(async()=>root.render(header(true,true)));
 expect(host.querySelector("h1")?.textContent).toBe("סמג״ד המחץ");
 await click(button("הוספה מהירה")!);
 await click(button("חיפוש בכל האפליקציה")!);
 await click(button("עדכונים אחרונים, יש עדכונים")!);
 for(const fn of [onCapture,onSearch,onActivity])expect(fn).toHaveBeenCalledOnce();
 await act(async()=>root.render(header(false,false)));
 expect(host.querySelector("h1")?.textContent).toBe("סגני המחץ");
 expect(button("הוספה מהירה")).toBeUndefined();
 expect(button("חיפוש בכל האפליקציה")).toBeTruthy();
});

it("declares the current primary page while exposing More as a dialog trigger",async()=>{
 const onGo=vi.fn(),onMore=vi.fn();
 await act(async()=>root.render(<WorkspaceMobileNav view="tasks" moreOpen={false} onGo={onGo} onMore={onMore}/>));
 expect(button("משימות")?.getAttribute("aria-current")).toBe("page");
 expect(button("עוד")?.getAttribute("aria-haspopup")).toBe("dialog");
 expect(button("עוד")?.getAttribute("aria-expanded")).toBe("false");
 await click(button("ספרייה")!);
 await click(button("עוד")!);
 expect(onGo).toHaveBeenCalledWith("library");
 expect(onMore).toHaveBeenCalledOnce();
});

it("keeps overflow entries, excludes duplicate primary tabs and never creates access for readers",async()=>{
 const onGo=vi.fn();
 const node=(may:boolean)=><WorkspaceMore items={may?[["tasks","משימות",CheckCheck],["calendar","לו״ז",CalendarDays],["personal","אישי",UserRound]]:[["tasks","משימות",CheckCheck],["calendar","לו״ז",CalendarDays]]} view="calendar" canManageAccess={may} onGo={onGo} onClose={noop} onSearch={noop} onRefresh={noop} onAccount={noop} guest={false} signingOut={false}/>;
 await act(async()=>root.render(node(false)));
 const sheet=document.querySelector("[role=dialog]")!;
 expect(button("לו״ז",sheet)?.getAttribute("aria-current")).toBe("page");
 expect(button("משימות",sheet)).toBeUndefined();
 expect(button("אישי",sheet)).toBeUndefined();
 expect(button("ניהול גישה",sheet)).toBeUndefined();
 await act(async()=>root.render(node(true)));
 expect(button("אישי",sheet)).toBeTruthy();
 await click(button("ניהול גישה",sheet)!);
 expect(onGo).toHaveBeenCalledWith("access");
});
