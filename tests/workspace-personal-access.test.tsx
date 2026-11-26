// @vitest-environment happy-dom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,expect,it,vi} from "vitest";
import Workspace from "../src/components/workspace";
vi.mock("../src/components/push-settings",()=>({PushSettings:()=>null,PushAutoRestore:()=>null}));
vi.mock("../src/components/manual-device-prompt",()=>({default:()=>null,ManualDevicePrompt:()=>null}));
vi.mock("@/lib/offline",()=>({apiFetch:(...a:Parameters<typeof fetch>)=>fetch(...a),clearOffline:()=>{},offlineStatus:()=>[]}));
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
afterEach(()=>{vi.unstubAllGlobals();history.replaceState({},"","/");});
const today="2026-11-26",owner="fixture-owner",reader="fixture-reader";
const old=(id:string,title:string,assigned:string)=>({id,title,description:"",ownerId:assigned,creatorId:owner,domainId:"fixture",companyId:null,status:"open",priority:"normal",dueDate:null,createdAt:today,updatedAt:today,version:1,requiresReview:false,blockerReason:null,comments:[]});
const item=(id:string,title:string,assigned:string,category="task",frequency="once",archived=false)=>({id,title,description:"",creatorId:owner,assigneeIds:[assigned],category,hasDeadline:false,frequency,startDate:today,endDate:null,completionMode:"individual",important:false,manualUrgent:false,archived,version:1});
const occ=(i:ReturnType<typeof item>)=>({id:i.id+"-occ",itemId:i.id,dueDate:today,done:false,urgent:false,version:1,completions:{},reports:{},completedAt:null,completedBy:null});
const textButton=(scope:ParentNode,label:string)=>Array.from(scope.querySelectorAll("button")).find(b=>b.textContent?.trim()===label||b.getAttribute("aria-label")===label);
const click=async(button:HTMLElement)=>await act(async()=>button.click());
const personal="משימה ותיקה אישית", oneOff="משימה חד פעמית אישית", point="נקודה פרטית לבדיקה", archivedPoint="נקודה בארכיון לבדיקה", recurring="משימה חוזרת אישית";
it.each(["owner","editor","ordinary","guest"] as const)("keeps personal task access and shared counts separate for %s",async role=>{
 const id=role==="owner"?owner:role==="editor"?"fixture-editor":reader;
 const user={id,workspaceOwnerId:owner,organizationId:"fixture-org",name:"חשבון בדיקה",role:role==="guest"?"viewer":role==="ordinary"?"contributor":"deputy",permissions:{editAll:role==="owner"||role==="editor",manageAccess:role==="owner",guest:role==="guest"}};
 const base=user.permissions.editAll?"/":"/deputies";
 const people=[{id:owner,name:"בעל מרחב לדוגמה"},{id:reader,name:"משתמש לדוגמה"}];
 const tasks=[old("shared","משימה ותיקה משותפת",reader),...(user.permissions.editAll?[old("personal",personal,owner)]:[])];
 const items=[item("shared-once","משימה חד פעמית משותפת",reader),...(user.permissions.editAll?[item("personal-once",oneOff,owner),item("point",point,owner,"point"),item("archived-point",archivedPoint,owner,"point","once",true),item("personal-recurring",recurring,owner,"task","daily")]:[])];
 const writes:{path:string;body:Record<string,unknown>}[]=[];
 vi.stubGlobal("fetch",vi.fn(async (input:string,init?:RequestInit)=>{
  if(typeof input!=="string"||!input.startsWith("/api/"))throw Error("Non-fixture traffic blocked");
  const path=input.split("?")[0];
  if(init?.method&&init.method!=="GET"){
   if(role!=="editor"||init.method!=="PATCH"||!["/api/rhythm/items/personal-once","/api/tasks/personal"].includes(path))throw Error("Unexpected fixture write");
   const body=JSON.parse(String(init.body));writes.push({path,body});return Response.json({ok:true});
  }
  if(path==="/api/workspace")return Response.json({user,tasks,users:people,domains:[],companies:[],activity:[],decisions:[],today,demo:false,pinnedTaskKeys:[],rhythmDueReminder:[]});
  if(path==="/api/rhythm")return Response.json({items,occurrences:items.map(occ),groups:[],people,today,month:today.slice(0,7)});
  if(path==="/api/deadline-requests")return Response.json([]);
  return Response.json({}, {status:404});
 }));
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const go=async(view:string)=>await act(async()=>{history.replaceState({},"",base+"?view="+view);window.dispatchEvent(new PopStateEvent("popstate"));window.dispatchEvent(new Event("samgad:saved"));});
 try{
  history.replaceState({},"",base);await act(async()=>root.render(<Workspace/>));
  const desktop=host.querySelector('nav[aria-label="ניווט ראשי במחשב"]')!;
  const snapshot=host.querySelector(".command-stats .total strong");
  if(user.permissions.editAll)expect(snapshot?.textContent).toBe("2");
  expect(Boolean(textButton(desktop,"אישי"))).toBe(user.permissions.editAll);
  expect(Boolean(textButton(desktop,"ניהול גישה"))).toBe(role==="owner");
  if(role==="editor"){
   await click(textButton(host,"עוד")!);
   const more=document.querySelector('[role="dialog"]')!;
   expect(textButton(more,"אישי")).toBeTruthy();
   await click(textButton(more,"אישי")!);
  }else if(role==="owner") await click(textButton(desktop,"אישי")!);
  else await go("personal");
  expect(host.textContent?.includes(personal)).toBe(user.permissions.editAll);
  expect(host.textContent?.includes(oneOff)).toBe(user.permissions.editAll);
  expect(location.search.includes("view=personal")).toBe(user.permissions.editAll);
  if(role==="editor"){
   for(const forbidden of [point,archivedPoint,recurring,"הוספת משימה","קבוצות","הוספת קבוצה"])expect(host.querySelector("main")?.textContent).not.toContain(forbidden);
   expect(textButton(host,"נקודות לעיסוק")).toBeUndefined();
   await go("personal&tab=points");
   expect(host.textContent).toContain(oneOff);
   expect(host.textContent).not.toContain(point);
   await click(textButton(host,"אפשרויות למשימה "+oneOff)!);
   await click(textButton(document,"עריכה")!);
   const rhythmForm=document.querySelector<HTMLFormElement>('.quick-task-form')!;
   expect(rhythmForm.querySelector(".role-chips")).toBeNull();
   rhythmForm.querySelector<HTMLInputElement>('input[name=title]')!.value="כותרת חדשה לדוגמה";
   await act(async()=>rhythmForm.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
   expect(writes[0]).toMatchObject({path:"/api/rhythm/items/personal-once",body:{title:"כותרת חדשה לדוגמה",category:"task",recipientIds:[owner],version:1}});
   await click(Array.from(host.querySelectorAll<HTMLButtonElement>(".task-open")).find(b=>b.textContent?.includes(personal))!);
   const legacyForm=document.querySelector<HTMLFormElement>(".edit-details form")!;
   expect(legacyForm.querySelector('select[name=ownerId]')).toBeNull();
   legacyForm.querySelector<HTMLInputElement>('input[name=title]')!.value="כותרת ותיקה חדשה";
   await act(async()=>legacyForm.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
   expect(writes[1]).toMatchObject({path:"/api/tasks/personal",body:{title:"כותרת ותיקה חדשה",version:1}});
   expect(writes[1].body).not.toHaveProperty("ownerId");
   await go("access");
   expect(location.search).not.toContain("view=access");
  }
  await go("tasks");
  expect(host.textContent).toContain("משימה ותיקה משותפת");
  expect(host.textContent).toContain("משימה חד פעמית משותפת");
  for(const privateLabel of [personal,oneOff,point])expect(host.textContent).not.toContain(privateLabel);
  expect(writes).toHaveLength(role==="editor"?2:0);
 }finally{await act(async()=>root.unmount());host.remove();}
});
