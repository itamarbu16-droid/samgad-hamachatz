// @vitest-environment happy-dom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import Workspace from "../src/components/workspace";

const {offlineStatus,clearOffline,uploads}=vi.hoisted(()=>({
 offlineStatus:vi.fn(),clearOffline:vi.fn(),
 uploads:{clear:vi.fn(),setIdentity:vi.fn()},
}));
vi.mock("../src/lib/offline",()=>({apiFetch:(...args:Parameters<typeof fetch>)=>fetch(...args),offlineStatus,clearOffline}));
vi.mock("../src/components/document-upload-provider",()=>({DocumentUploadProvider:({children}:{children:React.ReactNode})=>children,DocumentUploadStatus:()=>null,useDocumentUploadStore:()=>uploads}));
vi.mock("../src/components/push-settings",()=>({PushAutoRestore:()=>null,PushSettings:()=>null}));
vi.mock("../src/components/manual-device-prompt",()=>({default:()=>null,ManualDevicePrompt:()=>null}));
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});

let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 offlineStatus.mockReset().mockResolvedValue([]);clearOffline.mockReset().mockResolvedValue(undefined);
 uploads.clear.mockClear();uploads.setIdentity.mockClear();
});
afterEach(async()=>{
 await act(async()=>root.unmount());host.remove();
 vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState({},"","/");
});
const button=(name:string,scope:ParentNode=document)=>Array.from(scope.querySelectorAll("button")).find(el=>el.getAttribute("aria-label")===name||el.textContent?.trim()===name)!;
const click=async(el:HTMLElement)=>{await act(async()=>el.click());};
const openMore=async()=>{const more=button("עוד");more.focus();await click(more);return document.querySelector("[role=dialog]")!;};
async function setup({guest=false,manager=false,request=async()=>Response.json({ok:true})}:{
 guest?:boolean;manager?:boolean;request?:()=>Promise<Response>;
}={}){
 const user={id:"fixture",name:"Synthetic",role:guest?"viewer":"contributor",organizationId:"fixture-space",permissions:{editAll:manager,manageAccess:manager,guest}};
 const today="2026-11-24";
 const reads:Record<string,unknown>={
  "/api/workspace":{user,tasks:[],decisions:[],domains:[],users:[user],companies:[],activity:[],demo:true,today},
  "/api/rhythm":{today,month:"2026-11",items:[],occurrences:[],groups:[],people:[]},
  "/api/deadline-requests":[],
  "/api/calendar/agenda":{connected:false,events:[]},
 };
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==="POST")return request();
  return Response.json(reads[url.split("?")[0]]??{});
 });
 vi.stubGlobal("fetch",fetcher);
 const navigate=vi.spyOn(window.location,"assign").mockImplementation(()=>{});
 history.replaceState({},"",manager?"/":"/deputies");
 await act(async()=>root.render(<Workspace/>));
 return {navigate,posts:()=>fetcher.mock.calls.filter(([,init])=>init?.method==="POST")};
}

it("More gives a guest login without reading the queue or ending a session",async()=>{
 const {navigate,posts}=await setup({guest:true});
 const menu=await openMore();
 expect(button("התנתקות",menu)).toBeUndefined();
 await click(button("כניסה לחשבון",menu));
 expect(document.querySelector("[role=dialog]")).toBeNull();
 expect(navigate).toHaveBeenCalledExactlyOnceWith("/login");
 expect(posts()).toEqual([]);
 expect(offlineStatus).not.toHaveBeenCalled();
 expect(uploads.clear).not.toHaveBeenCalled();
});

it("blocks sign-out with offline pending changes and focuses a dismissible alert",async()=>{
 offlineStatus.mockResolvedValue([{id:"pending-synthetic"}]);
 const {navigate,posts}=await setup();
 const menu=await openMore();
 expect(button("כניסה לחשבון",menu)).toBeUndefined();
 await click(button("התנתקות",menu));
 expect(document.querySelector("[role=dialog]")).toBeNull();
 const alert=host.querySelector("[role=alert]")!;
 expect(alert.textContent).toContain("שינויים שממתינים לסנכרון");
 expect(document.activeElement).toBe(alert);
 expect(posts()).toEqual([]);
 expect(navigate).not.toHaveBeenCalled();
 expect(uploads.clear).not.toHaveBeenCalled();
 expect(clearOffline).not.toHaveBeenCalled();
 await click(button("סגירת שגיאת התנתקות",host));
 expect(host.querySelector("[role=alert]")).toBeNull();
 expect(document.activeElement?.id).toBe("main-content");
});

it.each([
 ["network rejection",async()=>{throw Error("Synthetic network unavailable");}],
 ["non-2xx response",async()=>Response.json({error:"Synthetic server failure"},{status:503})],
] as const)("preserves the session and both queues after %s",async(_case,request)=>{
 const {navigate,posts}=await setup({request});
 await click(button("התנתקות",await openMore()));
 expect(posts()).toHaveLength(1);
 expect(host.querySelector("[role=alert]")?.textContent).toContain("ההתנתקות לא הצליחה");
 expect(navigate).not.toHaveBeenCalled();
 expect(uploads.clear).not.toHaveBeenCalled();
 expect(clearOffline).not.toHaveBeenCalled();
 expect(button("עוד",host)).toBeTruthy();
});

it.each([true,false])("uses one successful request for both surfaces and keeps /login (mobile=%s)",async mobile=>{
 let resolve!:()=>void;
 const request=()=>new Promise<Response>(done=>{resolve=()=>done(Response.json({ok:true}));});
 const {navigate,posts}=await setup({manager:!mobile,request});
 const sidebar=button("התנתקות",host.querySelector(".sidebar")!);
 const primary=mobile?button("התנתקות",await openMore()):sidebar;
 await act(async()=>{
  primary.click();
  sidebar.click(); // A second surface attempts before React's disabled state is painted.
 });
 expect(offlineStatus).toHaveBeenCalledOnce();
 expect(posts()).toEqual([["/api/auth/sign-out",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}]]);
 expect(uploads.clear).not.toHaveBeenCalled();
 expect(clearOffline).not.toHaveBeenCalled();
 expect(navigate).not.toHaveBeenCalled();
 await act(async()=>resolve());
 expect(uploads.clear).toHaveBeenCalledOnce();
 expect(clearOffline).toHaveBeenCalledOnce();
 expect(navigate).toHaveBeenCalledExactlyOnceWith("/login");
 expect(host.querySelector("[role=alert]")).toBeNull();
});
