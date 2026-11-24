// @vitest-environment happy-dom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import Workspace from "../src/components/workspace";
import {addDays} from "../src/lib/rhythm";
import {calendarDay} from "../src/lib/schedule-navigation";

vi.mock("../src/lib/offline",()=>({apiFetch:(...args:Parameters<typeof fetch>)=>fetch(...args),clearOffline:()=>Promise.resolve(),offlineStatus:async()=>[]}));
vi.mock("../src/components/push-settings",()=>({PushAutoRestore:()=>null,PushSettings:()=>null}));

Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();history.replaceState({},"","/");});
const click=async (button:HTMLElement)=>{await act(async()=>button.click());};
const byLabel=(label:string)=>Array.from(host.querySelectorAll("button")).find(node=>node.textContent?.trim()===label||node.getAttribute("aria-label")===label);

it("calendar header preserves existing quick add without a floating control, and next advances days and weeks",async()=>{
 const today=calendarDay();
 const user={id:"fixture",name:"עורך לבדיקה",role:"deputy",organizationId:"fixture-space",permissions:{editAll:true,manageAccess:true,guest:false}};
 const reads:Record<string,unknown>={
   "/api/workspace":{user,tasks:[],decisions:[],domains:[],users:[user],companies:[],activity:[],demo:true,today},
   "/api/rhythm":{today,month:today.slice(0,7),items:[],occurrences:[],groups:[],people:[]},
   "/api/deadline-requests":[],
   "/api/calendar/agenda":{connected:true,events:[]},
   "/api/calendar/source":{selected:"fixture-calendar",calendars:[{id:"fixture-calendar",name:"יומן הדגמה",canWrite:true}]},
   "/api/calendar":{configured:true,connected:true,invitees:[]},
 };
 const fetchStub=vi.fn(async (url:string,init?:RequestInit)=>{
   expect(init?.method||"GET").toBe("GET");
   const path=url.split("?")[0];
   if(!(path in reads))throw Error("Unexpected synthetic route: "+path);
   return Response.json(reads[path]);
 });
 vi.stubGlobal("fetch",fetchStub);
 history.replaceState({},"","/?view=calendar");
 await act(async()=>root.render(<Workspace/>));
 expect(byLabel("הוספת משימה")).toBeTruthy();
 expect(host.querySelector(".capture-button")).toBeNull();
 const input=host.querySelector<HTMLInputElement>('input[aria-label="בחירת תאריך"]')!;
 expect(input.value).toBe(today);
 await click(byLabel("היום הבא")!);
 expect(input.value).toBe(addDays(today,1));
 await click(byLabel("שבועית")!);
 expect(byLabel("שבועית")?.getAttribute("aria-pressed")).toBe("true");
 await click(byLabel("השבוע הבא")!);
 expect(input.value).toBe(addDays(today,8));
 await click(byLabel("הוספת משימה")!);
 expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("הוספה מהירה");
});
