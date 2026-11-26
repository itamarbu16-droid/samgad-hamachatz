"use client";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type ComponentProps } from "react";
import { apiFetch } from "@/lib/offline";
import {useTrackerDrag} from "./use-tracker-drag";
import { Modal } from "./workspace-primitives";
import { Plus, MoreHorizontal, Pencil, FolderInput, Scissors, Copy, Trash2 } from "lucide-react";
import TrackerAssistant from "./tracker-assistant";
import FlexibleTrackerEditor from "./flexible-tracker";
import { emptyFlexibleTracker, FLEXIBLE_TRACKER_KIND, parseFlexibleTracker, type FlexibleTracker } from "@/lib/flexible-tracker";
import {
  INITIAL_TRACKING_ROWS, MAX_TRACKING_COLUMNS, MAX_TRACKING_ROWS, MAX_TRACKING_COLUMN_NAME,
  initialTrackingColumns as initialColumns, openTrackingSheet, addTrackingRow, appendTrackingColumn, mergeTrackingEdits, shiftTrackingColumn,
  type TrackingColumn as Column, type TrackingSheet as Sheet, type TrackingShift,
} from "@/lib/tracking-sheet";

type Entry = { id: string; title: string; version: number; creatorId: string; preview?:string; attachments?:{id:string;filename:string;byteSize:number}[] };
const initialTitle = "הסמכת תחמושת מתפצלת";
type Folder={id:string;name:string;parent:string|null;section:string};
export default function TrackingTables({userId,role,back,addFile,openFile,refreshKey,folderId,folders,navigate,foldersChanged,editAll=false,folderActions,folderPress,canContextFolder,cutEntry}:{editAll?:boolean;folderActions?:(folder:Folder)=>ReactNode;folderPress?:(folder:Folder)=>ComponentProps<"button">;canContextFolder?:(folder:Folder)=>boolean;cutEntry?:(entry:Entry)=>void;userId:string;role:string;back:()=>void;addFile:()=>void;openFile:(id:string,edit?:boolean)=>void;refreshKey:number;folderId:string;folders:Folder[];navigate:(id:string)=>void;foldersChanged:()=>void}) {
  const manager = editAll || ["deputy","staff","company_commander"].includes(role);
  const canWrite = manager || role === "contributor";
  const editorContext=editAll||role==="deputy";
  const [entries,setEntries]=useState<Entry[]>([]),[selected,setSelected]=useState<Entry|null>(null);
  const [sheet,setSheet]=useState<Sheet>({columns:initialColumns,rows:[]});
  const [title,setTitle]=useState(initialTitle);
  const [flexible,setFlexible]=useState<FlexibleTracker|null>(null);
  const [flexibleInstance,setFlexibleInstance]=useState(0);
  const editorHeading=useRef<HTMLHeadingElement>(null);
  const [editorVisits,setEditorVisits]=useState(0);
  useEffect(()=>{
    // Opening the editor must move focus from the card but not open a phone keyboard.
    const heading=editorHeading.current;
    if(!editorVisits||!heading)return;
    heading.focus({preventScroll:true});
    heading.scrollIntoView({block:"start",inline:"nearest"});
  },[editorVisits]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[creating,setCreating]=useState(false);
  const [assisting,setAssisting]=useState(false),[assistantDraft,setAssistantDraft]=useState(false);
  const requestId=useRef("");
  const savedTracker=useRef<{sheet:Sheet;title:string}|null>(null);
  const [saveError,setSaveError]=useState("");
  const saveInProgress=useRef(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [creatingFolder,setCreatingFolder]=useState(false);
  const [addingColumn,setAddingColumn]=useState(false),[columnError,setColumnError]=useState("");
  const tableScroll=useRef<HTMLDivElement>(null);
  const nextFocus=useRef<{row:number;keyboard:boolean}|{column:string}|null>(null);
  const shifts=useRef<TrackingShift[]>([]);
  const [cellAction,setCellAction]=useState<{index:number;column:Column;anchor:HTMLElement}|null>(null);
  const [undoShift,setUndoShift]=useState<{sheet:Sheet;dirty:boolean;shifts:TrackingShift[]}|null>(null);
  const namePress=useRef<{timer:number;id:number;x:number;y:number}|null>(null);
  const suppressNameClick=useRef<HTMLInputElement|null>(null);
  useEffect(()=>()=>{if(namePress.current)window.clearTimeout(namePress.current.timer);},[]);

  useEffect(()=>{
    const target=nextFocus.current;
    if(!target)return;
    nextFocus.current=null;
    const grid=tableScroll.current;
    if(!grid)return;
    if("row" in target&&!target.keyboard){
      // Keep the current column in view on a touch device and do not summon its keyboard.
      grid.scrollTop=grid.scrollHeight;
      return;
    }
    const selector="row" in target?`[data-tracker-row="${target.row}"] input`:`[data-tracker-column="${target.column}"]`;
    const cell=grid.querySelector<HTMLElement>(selector);
    cell?.focus({preventScroll:true});
    cell?.scrollIntoView({block:"nearest",inline:"nearest"});
  },[sheet]);
  const [copy,setCopy]=useState<Entry|null>(null);
  const copyRequest=useRef("");
  const [marked,setMarked]=useState<string[]>([]);
  const [organizing,setOrganizing]=useState<Entry[]|null>(null);
  function organize(items:Entry[]){
    if(dirty&&!window.confirm("הפעולה תשתמש בגרסה השמורה. להמשיך?"))return;
    setError("");setOrganizing(items);
  }
  function destinationPath(id:string){const names:string[]=[];const seen=new Set<string>();let current:string|null=id;while(current&&!seen.has(current)){seen.add(current);const f=folders.find(f=>f.id===current);if(!f)break;names.unshift(f.name);current=f.parent;}return names.join(' / ');}

  const [actionItems,setActionItems]=useState<Entry[]|null>(null);
  const [actionAnchor,setActionAnchor]=useState<HTMLElement|null>(null);
  const [trashItems,setTrashItems]=useState<Entry[]|null>(null);
  const dragDrop=useTrackerDrag((ids,target)=>{void manage(entries.filter(e=>ids.includes(e.id)),'move',target);},(ids,anchor)=>{if(editorContext&&!busy){const allowed=entries.filter(e=>ids.includes(e.id)&&mayManage(e));if(allowed.length){setActionAnchor(anchor??null);setActionItems(allowed);}}});
  function mayManage(entry:Entry){return manager||entry.creatorId===userId;}
  async function manage(items:Entry[],action:'move'|'trash'|'restore',target?:string){
    if(busy||!canWrite||!items.length)return;
    if(dirty&&!window.confirm('יש שינויים שלא נשמרו. להמשיך עם הגרסה השמורה?'))return;
    if(action==='trash'&&!window.confirm(`למחוק ${items.length===1?'את '+items[0].title:items.length+' מעקבים'}? אפשר לשחזר מתוך ״נמחקו לאחרונה״.`))return;
    setBusy(true);setError('');
    try{
      const r=await apiFetch('/api/documents/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,items:items.map(({id,version})=>({id,version})),...(target?{folderId:target}:{})})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'הפעולה נכשלה');
      setMarked([]);setActionItems(null);setOrganizing(null);
      if(selected&&items.some(e=>e.id===selected.id)){setActive(false);setSelected(null);setDirty(false);}
      setNotice(action==='move'?`${items.length} מעקבים הועברו לתיקייה ${destinationPath(target!)}`:action==='trash'?'המעקבים נמחקו. ניתן לשחזר מתוך ״נמחקו לאחרונה״.':'המעקבים שוחזרו לתיקייה המקורית');
      await load();if(trashItems!==null)await loadTrash();window.dispatchEvent(new Event('samgad:saved'));
    }catch(e){setError(e instanceof Error?e.message:'הפעולה נכשלה');await load();}
    finally{setBusy(false);}
  }
  async function loadTrash(){
    const r=await apiFetch('/api/documents/manage',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'לא ניתן לטעון מחיקות');setTrashItems(d.entries);
  }
  function dragIds(entry:Entry){return marked.includes(entry.id)?marked:[entry.id];}
  const folderRequest=useRef("");
  const currentFolder=folders.find(f=>f.id===folderId);
  const subfolders=folders.filter(f=>f.parent===folderId);
  function trackingDestination(id:string){const seen=new Set<string>();let current:string|null=id;while(current&&!seen.has(current)){if(current==='trackers')return true;seen.add(current);current=folders.find(f=>f.id===current)?.parent??null;}return false;}
  const destinations=folders.filter(f=>trackingDestination(f.id));
  function askCopy(entry:Entry){if(dirty&&!window.confirm("יש שינויים שלא נשמרו. הפעולה תשתמש בגרסה השמורה. להמשיך?"))return;copyRequest.current=crypto.randomUUID();setError("");setCopy(entry);}

  const [active,setActive]=useState(false);
  const load=useCallback(async ()=>{
    const response=await apiFetch("/api/documents",{cache:"no-store"});const data=await response.json();
    if(!response.ok)throw new Error(data.error);setEntries(data.entries.filter((e:Entry & {folderId:string})=>e.folderId===folderId));
  },[folderId]);
  useEffect(()=>{load().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[load,refreshKey]);
  const editable=canWrite;
  function change(next:Sheet){setSheet(next);setDirty(true);setNotice("");setUndoShift(null);}
  function changeName(index:number,columnId:string,value:string){
    change({...sheet,rows:sheet.rows.map((row,i)=>i===index?{
      ...row,[columnId]:value,...(!value&&row[columnId]?{[columnId+':status']:""}:{}),
    }:row)});
  }
  function cancelNamePress(){
    if(namePress.current)window.clearTimeout(namePress.current.timer);
    namePress.current=null;
  }
  function openCellActions(index:number,column:Column,anchor:HTMLElement){
    if(editable&&!busy&&sheet.rows[index]?.[column.id])setCellAction({index,column,anchor});
  }
  function startNamePress(event:PointerEvent<HTMLInputElement>,index:number,column:Column){
    cancelNamePress();suppressNameClick.current=null;
    if(!editable||busy||!event.isPrimary||event.button!==0||!sheet.rows[index]?.[column.id])return;
    const input=event.currentTarget;
    // Normal editing on a focused input still supports native selection and paste.
    if(document.activeElement===input)return;
    namePress.current={id:event.pointerId,x:event.clientX,y:event.clientY,timer:window.setTimeout(()=>{
      suppressNameClick.current=input;
      input.blur();
      openCellActions(index,column,input.closest<HTMLElement>('.tracking-cell-editor')??input);
    },550)};
  }
  function moveNamePress(event:PointerEvent<HTMLInputElement>){
    const press=namePress.current;
    if(press?.id===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>9)cancelNamePress();
  }
  function deleteAndShift(){
    if(!cellAction||!editable||busy)return;
    const operation={columnId:cellAction.column.id,from:cellAction.index};
    const next=shiftTrackingColumn(sheet,operation);
    if(next===sheet)return;
    const previous={sheet,dirty,shifts:shifts.current};
    shifts.current=[...previous.shifts,operation];
    change(next);setUndoShift(previous);setCellAction(null);
    setNotice("השם והסימון הוסרו, והטור קודם. השינוי עדיין לא נשמר.");
  }
  function undoColumnShift(){
    if(!undoShift||!editable||busy)return;
    shifts.current=undoShift.shifts;
    setSheet(undoShift.sheet);setDirty(undoShift.dirty);setUndoShift(null);setNotice("");
  }

  function addRow(event:MouseEvent<HTMLButtonElement>){
    if(!editable||busy)return;
    const next=addTrackingRow(sheet);
    if(next===sheet)return;
    nextFocus.current={row:next.rows.length,keyboard:event.detail===0};
    change(next);
  }
  function startAddColumn(){
    if(!editable||busy||sheet.columns.length>=MAX_TRACKING_COLUMNS)return;
    setColumnError("");setAddingColumn(true);
  }
  async function open(entry:Entry,editFile=false) {
    setBusy(true);setError("");
    try {const r=await apiFetch(`/api/documents/${entry.id}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);
      let parsed;try{parsed=JSON.parse(d.entry.body);}catch{parsed=null;}
      if(parsed?.kind!=="tracking-table-v1"&&parsed?.kind!==FLEXIBLE_TRACKER_KIND){openFile(entry.id,editFile);return;}
      if(parsed.kind===FLEXIBLE_TRACKER_KIND){
        const grid=parseFlexibleTracker(parsed);
        if(!grid)throw new Error("לא ניתן לפתוח את מבנה המעקב. המעקב השמור לא שונה");
        if(dirty&&!window.confirm("יש שינויים שלא נשמרו. לצאת בלעדיהם?"))return;
        savedTracker.current=null;shifts.current=[];setUndoShift(null);setSaveError("");
        setAssistantDraft(false);setFlexible(grid);setFlexibleInstance(n=>n+1);setActive(true);setSelected(d.entry);setTitle(d.entry.title);setDirty(false);setNotice("");setEditorVisits(n=>n+1);
        return;
      }
      if(!Array.isArray(parsed.columns)||!Array.isArray(parsed.rows))throw new Error("הפריט אינו טבלת מעקב תקינה");
      if(dirty&&!window.confirm("יש שינויים שלא נשמרו. לצאת בלעדיהם?"))return;
      setAssistantDraft(false);setFlexible(null);
      const opened=openTrackingSheet(parsed);
      savedTracker.current={sheet:opened,title:d.entry.title};
      shifts.current=[];setUndoShift(null);
      setActive(true);setSelected(d.entry);setTitle(d.entry.title);setSheet(opened);setDirty(false);setNotice("");setSaveError("");setEditorVisits(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:"לא ניתן לפתוח");}finally{setBusy(false);}
  }
  function fresh(name:string,columns:Column[]|null,fromAssistant?:FlexibleTracker){
    savedTracker.current=null;shifts.current=[];setUndoShift(null);setSaveError("");setActive(true);
    requestId.current=crypto.randomUUID();setSelected(null);setTitle(name);
    setAssistantDraft(Boolean(fromAssistant));setFlexible(columns?null:fromAssistant??emptyFlexibleTracker());setFlexibleInstance(n=>n+1);
    if(columns)setSheet({columns,rows:Array.from({length:INITIAL_TRACKING_ROWS},()=>({}))});
    setDirty(true);setCreating(false);setAssisting(false);setNotice("");setEditorVisits(n=>n+1);
  }
  async function saveFlexible(grid:FlexibleTracker){
    if(saveInProgress.current)return;
    saveInProgress.current=true;setBusy(true);setSaveError("");setError("");setNotice("");
    try{
      requestId.current ||= crypto.randomUUID();
      const body=JSON.stringify(grid);
      if(body.length>100000)throw Error("הטבלה גדולה מדי. יש לפצל למעקבים נוספים");
      const response=await apiFetch(selected?"/api/documents/"+selected.id:"/api/documents",{
        method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({title,body,folderId,...(selected?{version:selected.version}:{clientRequestId:requestId.current})}),
      });
      const data=await response.json();
      if(response.status===409&&selected)throw Error("הטבלה השמורה השתנתה. השינויים שלך נשארו פתוחים ולא דרסו את השמירה האחרת.");
      if(!response.ok)throw Error(data.error||"השמירה נכשלה");
      if(!mounted.current)return;
      setSelected({id:data.entry.id,title,creatorId:selected?.creatorId||userId,version:(selected?.version??0)+1});
      setAssistantDraft(false);setDirty(false);setNotice("המעקב נשמר");
      window.dispatchEvent(new Event('samgad:saved'));
      await load().catch(()=>setError("המעקב נשמר, אך לא ניתן לעדכן את רשימת המעקבים"));
    }catch(error){if(mounted.current)setSaveError(error instanceof Error?error.message:"השמירה נכשלה");}
    finally{saveInProgress.current=false;if(mounted.current)setBusy(false);}
  }
  async function save(){
    if(flexible)return saveFlexible(flexible);
    if(saveInProgress.current)return;
    saveInProgress.current=true;setBusy(true);setSaveError("");setError("");setNotice("");
    const base=savedTracker.current;
    const draft={sheet,title};
    const shiftedRanges=shifts.current;
    let candidate={...draft,version:selected?.version,creatorId:selected?.creatorId||userId};
    const persist=async () => {
      requestId.current ||= crypto.randomUUID();
      const body=JSON.stringify({kind:"tracking-table-v1",...candidate.sheet});
      if(body.length>100000)throw new Error("הטבלה גדולה מדי. יש לפצל למעקבים נוספים");
      return apiFetch(selected?"/api/documents/"+selected.id:"/api/documents",{
        method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({title:candidate.title,body,folderId,...(selected?{version:candidate.version}:{clientRequestId:requestId.current})}),
      });
    };
    try{
      let result:Entry|null=null;
      for(let attempt=0;attempt<3;attempt++){
        if(!mounted.current)return;
        const response=await persist();
        const data=await response.json();
        if(response.ok){
          result={id:data.entry.id,title:candidate.title,creatorId:candidate.creatorId,version:(candidate.version??0)+1};
          break;
        }
        if(response.status!==409||!selected||!base)throw new Error(data.error||"השמירה נכשלה");
        if(attempt===2)throw new Error("המעקב ממשיך להשתנות. השינויים שלך נשארו פתוחים; אפשר לנסות שוב.");
        if(!mounted.current)return;
        const latest=await apiFetch("/api/documents/"+selected.id,{cache:"no-store"});
        const read=await latest.json();
        if(!latest.ok)throw new Error(read.error||"לא ניתן לטעון את הגרסה העדכנית");
        const entry=read.entry;
        const parsed=JSON.parse(entry.body);
        if(entry.id!==selected.id||entry.folderId!==folderId||!Number.isSafeInteger(entry.version)||entry.version<=(candidate.version??0)||
          parsed?.kind!=="tracking-table-v1"||!Array.isArray(parsed.columns)||!Array.isArray(parsed.rows)){
          throw new Error("לא ניתן לשלב את הגרסה העדכנית. השינויים שלך נשארו פתוחים.");
        }
        const combined=mergeTrackingEdits(base.sheet,draft.sheet,openTrackingSheet(parsed),shiftedRanges);
        const localTitle=draft.title.trim();
        if(localTitle!==base.title&&entry.title!==base.title&&entry.title!==localTitle)
          throw new Error("מישהו שינה גם את שם המעקב. השם שהקלדת נשאר פתוח ולא דרס את השם השמור.");
        if("conflict" in combined)throw new Error(combined.conflict==="cell"
          ?"מישהו שינה גם תא שערכת בשורה "+combined.row+". השינויים שלך נשארו פתוחים ולא דרסו את השמירה האחרת."
          :combined.conflict==="shift"?"מישהו שינה את הטור שקידמת בשורה "+combined.row+". השינויים שלך נשארו פתוחים ולא דרסו את השמירה האחרת."
          :"מבנה המעקב השתנה. השינויים שלך נשארו פתוחים ולא דרסו את השמירה האחרת.");
        const mergedTitle=localTitle===base.title?entry.title:localTitle;
        candidate={sheet:combined.sheet,title:mergedTitle,version:entry.version,creatorId:entry.creatorId};
        if(!combined.changed&&mergedTitle===entry.title){
          // Another editor (or a prior response that was lost) already set
          // those values. No additional write or version increment is needed.
          result={id:entry.id,title:mergedTitle,creatorId:entry.creatorId,version:entry.version};
          break;
        }
      }
      if(!mounted.current||!result)return;
      savedTracker.current={sheet:candidate.sheet,title:candidate.title.trim()};
      shifts.current=[];setUndoShift(null);
      setSelected(result);setSheet(candidate.sheet);setTitle(candidate.title);setDirty(false);setNotice("המעקב נשמר");
      // The acknowledged save is independent of reloading the folder list.
      await load().catch(()=>setError("המעקב נשמר, אך לא ניתן לעדכן את רשימת המעקבים"));
    }catch(e){if(mounted.current)setSaveError(e instanceof Error?e.message:"השמירה נכשלה");}
    finally{saveInProgress.current=false;if(mounted.current)setBusy(false);}
  }
  return <div className="tracking-workspace">
    <div className="document-toolbar"><button className="button secondary" onClick={()=>{if(!dirty||window.confirm("לצאת ללא שמירת השינויים?"))back();}}>חזרה לספרייה</button><h2>{currentFolder?.name||"מעקבים"}</h2>{canWrite&&<button className="button secondary" disabled={busy} onClick={()=>void loadTrash().catch(e=>setError(e.message))}>נמחקו לאחרונה</button>}{folderId!=="trackers"&&<button className="button secondary" disabled={busy} onClick={()=>{if(!dirty||window.confirm("לצאת ללא שמירה?"))navigate(currentFolder?.parent||"trackers");}}>חזרה לתיקייה הקודמת</button>}{manager&&<button className="button secondary" disabled={busy} onClick={()=>{folderRequest.current=crypto.randomUUID();setCreatingFolder(true);}}>＋ תיקייה חדשה</button>}{canWrite&&<><button className="button secondary" disabled={busy} onClick={addFile}>הוספת קובץ סרוק / אקסל</button><button className="button primary" disabled={busy} onClick={()=>setCreating(true)}>＋ מעקב חדש</button></>}</div>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&notice!=="המעקב נשמר"&&<p role="status">{notice}</p>}
    {canWrite&&<p className="muted">לחיצה ארוכה על מעקב וגרירה לתיקייה תעביר אותו לתוכה. {editorContext?" לחיצה ארוכה ושחרור פותחים פעולות.":""}</p>}
    {dragDrop.drag&&<><div className="tracker-drop-tray" aria-label="תיקיות להעברה"><strong role="status">גרור לתיקייה ושחרר כדי להעביר</strong><div>{destinations.filter(f=>f.id!==folderId).map(f=><div key={f.id} data-tracker-drop={f.id} className={`tracker-drop-target ${dragDrop.drag?.target===f.id?'is-over':''}`}>📁 {destinationPath(f.id)}</div>)}</div></div><div className="tracker-drag-ghost" style={{left:Math.min(dragDrop.drag.x+12,window.innerWidth-200),top:Math.min(dragDrop.drag.y+16,window.innerHeight-70)}}>{dragDrop.drag.ids.length>1?`${dragDrop.drag.ids.length} מעקבים`:dragDrop.drag.title}</div></>}
    {canWrite&&entries.length>0&&<div className="document-toolbar"><button className="button secondary" disabled={busy} onClick={()=>setMarked(marked.length===entries.filter(mayManage).length?[]:entries.filter(mayManage).map(e=>e.id))}>{marked.length===entries.filter(mayManage).length?'ביטול בחירה':'בחירת הכול'}</button><span>{marked.length} נבחרו</span><button className="button primary" disabled={busy||!marked.length} onClick={()=>organize(entries.filter(e=>marked.includes(e.id)))}>העברה לתיקייה</button><button className="button secondary tracker-delete" disabled={busy||!marked.length} onClick={()=>void manage(entries.filter(e=>marked.includes(e.id)),'trash')}>מחיקה</button></div>}
    <div className="document-folder-grid">{subfolders.map(f=><div className="document-folder-shell" key={f.id}>
      {folderActions?.(f)}<button className={"document-folder-card"+(dragDrop.drag?.target===f.id?" tracker-folder-over":"")+(canContextFolder?.(f)?" document-context-target":"")}
        data-tracker-drop={f.id} disabled={busy}
        {...(!busy?folderPress?.(f):{})} onClick={()=>{if(!dirty||window.confirm("לצאת ללא שמירה?"))navigate(f.id);}}>
        <strong>📁 {f.name}</strong><span>פתיחת תיקייה</span>
      </button></div>)}
    {entries.map(e=>{
      const allowed=canWrite&&mayManage(e);
      return <div key={e.id} className="tracking-entry-card">
        {allowed&&<label><input type="checkbox" disabled={busy} checked={marked.includes(e.id)} onChange={event=>setMarked(ids=>event.target.checked?[...ids,e.id]:ids.filter(id=>id!==e.id))}/> בחירת {e.title}</label>}
        <button disabled={busy} className={"document-folder-card tracker-draggable"+(dragDrop.drag?.ids.includes(e.id)?" is-dragging":"")}
          onPointerDown={event=>{if(allowed&&!busy)dragDrop.startMouse(event,dragIds(e),e.title,e.id);}}
          onTouchStart={event=>{if(allowed&&!busy)dragDrop.startTouch(event,dragIds(e),e.title,e.id);}}
          onContextMenu={event=>{
            if(!allowed)return;event.preventDefault();
            if(event.button===2&&editorContext){setActionAnchor(event.currentTarget);setActionItems([e]);}
          }}
          onKeyDown={event=>{
            if(!allowed||!editorContext||(event.key!=='ContextMenu'&&!(event.key==='F10'&&event.shiftKey)))return;
            event.preventDefault();setActionAnchor(event.currentTarget);setActionItems([e]);
          }}
          onDragStart={event=>event.preventDefault()}
          onClick={()=>{if(!dragDrop.consumeClick())void open(e);}}>
          <strong>{e.title}</strong><span>{e.attachments?.length?e.attachments.length+" קבצים · פתיחה והורדה":"פתיחת טבלה"}</span>
          {e.attachments?.map(file=><small key={file.id}>{file.filename}</small>)}
        </button>
        {allowed&&<button type="button" className={"document-icon-action"+(editorContext?" tracker-context-action":"")} disabled={busy}
          aria-haspopup="dialog" aria-label={"פעולות עבור "+e.title} onClick={event=>{setActionAnchor(event.currentTarget.parentElement?.querySelector<HTMLElement>('.tracker-draggable')??event.currentTarget);setActionItems([e]);}}>
          <MoreHorizontal size={22}/>{!editorContext&&"פעולות"}
        </button>}
        {canWrite&&!editorContext&&<button className="button secondary" disabled={busy} onClick={()=>askCopy(e)}>שכפול / שבוע נוסף</button>}
      </div>;
    })}
    {folderId==="trackers"&&!loading&&!entries.some(e=>e.title===initialTitle)&&<button className="document-folder-card" disabled={!canWrite||busy} onClick={()=>{if(!dirty||window.confirm("להחליף את הטבלה שלא נשמרה?"))fresh(initialTitle,initialColumns);}}><strong>{initialTitle}</strong><span>טבלה מוכנה למילוי — שמירה תוסיף אותה למעקבים</span></button>}</div>
    {loading?<p role="status">טוען מעקבים…</p>:active?<section className="panel tracking-editor" aria-busy={busy}>
      <h2 ref={editorHeading} tabIndex={-1} style={{scrollMarginBlockStart:76}}>{editable?"עריכת מעקב":"תצוגת מעקב"}</h2>
      <label>שם הטבלה<input value={title} maxLength={160} disabled={!editable||busy||Boolean(selected&&!manager&&selected.creatorId!==userId)} onChange={e=>{setTitle(e.target.value);setDirty(true);setUndoShift(null);}} /></label>
      {assistantDraft&&<p role="status">תצוגה מקדימה. אפשר לערוך לפני היצירה בתיקייה {currentFolder?.name||"מעקבים"}.</p>}
      {flexible?<>{dirty&&<p role="status">שינויים לא נשמרו</p>}
        <FlexibleTrackerEditor key={flexibleInstance} grid={flexible} editable={editable} busy={busy} onChange={next=>{setFlexible(next);setDirty(true);setNotice("");}}/></>:<>
      <div className="tracking-structure-toolbar">
        <p role="status">{sheet.rows.length} שורות · {sheet.columns.length} עמודות{dirty?" · שינויים לא נשמרו":""}</p>
        {editable&&<div className="tracking-structure-actions">
          <button type="button" className="button secondary" aria-label="הוספת שורה" disabled={busy||sheet.rows.length>=MAX_TRACKING_ROWS} onClick={addRow}><Plus aria-hidden="true" size={17}/> שורה</button>
          <button type="button" className="button secondary" aria-label="הוספת עמודה" disabled={busy||sheet.columns.length>=MAX_TRACKING_COLUMNS} onClick={startAddColumn}><Plus aria-hidden="true" size={17}/> עמודה</button>
        </div>}
      </div>
      <div ref={tableScroll} className="tracking-scroll" role="region" aria-label="טבלת מעקב נגללת" tabIndex={0} dir="rtl" style={{maxHeight:"65vh",border:"1px solid #64748b"}}><table className="tracking-company-table" style={{borderCollapse:"collapse"}}><thead style={{position:"sticky",top:0,zIndex:1,background:"#182235",color:"#fff"}}><tr><th scope="col" style={{minWidth:36}}>#</th>{sheet.columns.map(c=><th key={c.id} scope="col" data-tracker-column={c.id} tabIndex={-1}>{c.name}</th>)}</tr></thead>
      <tbody>{sheet.rows.map((row,index)=><tr key={index} data-tracker-row={index+1}><th scope="row" style={{minWidth:36,padding:4,border:"1px solid #64748b"}}>{index+1}</th>{sheet.columns.map(c=>{
        const status=row[`${c.id}:status`]||"";
        return <td key={c.id} style={{padding:0,border:"1px solid #64748b",background:status==="v"?"#bbf7d0":status==="x"?"#fecaca":"#fff",color:"#111827"}}><div className="tracking-cell-editor"><input aria-label={`שם, ${c.name}, שורה ${index+1}`} style={{minWidth:120,width:"100%",height:36,border:0,borderRadius:0,background:"transparent",color:"inherit",padding:"4px 8px"}} maxLength={200} disabled={!editable||busy} value={row[c.id]||""} onChange={e=>changeName(index,c.id,e.target.value)}
          onPointerDown={e=>startNamePress(e,index,c)} onPointerMove={moveNamePress}
          onPointerUp={cancelNamePress} onPointerCancel={cancelNamePress} onPointerLeave={cancelNamePress}
          onContextMenu={e=>{if(namePress.current||suppressNameClick.current===e.currentTarget)e.preventDefault();}}
          onClickCapture={e=>{if(suppressNameClick.current===e.currentTarget){suppressNameClick.current=null;e.preventDefault();e.stopPropagation();}}}/>
          {editable&&row[c.id]&&<button type="button" className="tracker-name-action" aria-label={`פעולות שם, ${c.name}, שורה ${index+1}`} aria-haspopup="dialog" disabled={busy} onClick={event=>openCellActions(index,c,event.currentTarget.closest<HTMLElement>('.tracking-cell-editor')??event.currentTarget)}>⋯</button>}
          <select aria-label={`סימון, ${c.name}, שורה ${index+1}`} style={{minWidth:48,width:48,height:36,border:0,borderInlineStart:"1px solid #64748b",borderRadius:0,background:"transparent",color:"inherit",padding:2}} disabled={!editable||busy} value={status} onChange={e=>change({...sheet,rows:sheet.rows.map((r,i)=>i===index?{...r,[`${c.id}:status`]:e.target.value}:r)})}><option value="">—</option><option value="v">✓</option><option value="x">✗</option></select></div></td>;
      })}</tr>)}</tbody></table></div>
      {editable&&<div className="tracking-structure-footer"><button type="button" className="button secondary" disabled={busy||sheet.rows.length>=MAX_TRACKING_ROWS} onClick={addRow}><Plus aria-hidden="true" size={17}/> הוספת שורה בסוף הטבלה</button></div>}
      {editable&&(sheet.rows.length>=MAX_TRACKING_ROWS||sheet.columns.length>=MAX_TRACKING_COLUMNS)&&<p className="muted">עד {MAX_TRACKING_ROWS} שורות ו־{MAX_TRACKING_COLUMNS} עמודות במעקב. אפשר לפתוח מעקב נוסף.</p>}
      </>}
      <div className="document-toolbar">{selected&&editable&&<button className="button secondary" disabled={busy} onClick={()=>askCopy(selected)}>שכפול לשבוע נוסף</button>}{editable&&<button className="button primary" disabled={busy||!dirty||title.trim().length<2} onClick={()=>void save()}>{busy?"שומר…":assistantDraft?"יצירת המעקב":"שמירת המעקב"}</button>}</div>
      {undoShift&&<button type="button" className="button secondary" disabled={busy} onClick={undoColumnShift}>ביטול המחיקה והקידום</button>}
      {saveError&&<p className="error-banner" role="alert">{saveError}</p>}
      {notice==="המעקב נשמר"&&<p role="status">{notice}</p>}
      <small>{flexible?(assistantDraft?"המעקב יופיע בתיקייה אחרי לחיצה על יצירת המעקב.":"השינויים נשמרים רק בלחיצה על שמירת המעקב."):"למחיקת שם ולהשארת משבצת ריקה, מחקו את הטקסט. לקידום הטור, לחצו לחיצה ארוכה על השם או על ⋯. השינויים נשמרים רק בלחיצה על שמירה."}</small>
    </section>:<p>בחר טבלה או קובץ, או הוסף מעקב חדש כדי להתחיל.</p>}
    {cellAction&&editable&&<Modal actionSheet contextAnchor={cellAction.anchor} title="פעולות על שם במעקב" close={()=>setCellAction(null)}>
      <p>{cellAction.column.name}, שורה {cellAction.index+1}. השם והסימון יימחקו. רק הטור הזה יתקדם שורה אחת ומספר השורות לא ישתנה.</p>
      <div className="document-toolbar">
        <button type="button" className="button secondary" onClick={()=>setCellAction(null)}>ביטול</button>
        <button type="button" className="button primary" disabled={busy} onClick={deleteAndShift}>מחיקת שם וקידום הטור</button>
      </div>
    </Modal>}
    {addingColumn&&editable&&<Modal title="הוספת עמודה" close={()=>setAddingColumn(false)}><form onSubmit={event=>{
      event.preventDefault();
      if(busy)return;
      try {
        const name=String(new FormData(event.currentTarget).get("columnName")||"");
        const id=`custom-${crypto.randomUUID()}`;
        change(appendTrackingColumn(sheet,name,id));
        nextFocus.current={column:id};setAddingColumn(false);
      } catch(e){setColumnError(e instanceof Error?e.message:"לא ניתן להוסיף עמודה");}
    }}><label>שם העמודה<input name="columnName" required maxLength={MAX_TRACKING_COLUMN_NAME} autoComplete="off"/></label>
      {columnError&&<p role="alert">{columnError}</p>}<button className="button primary" disabled={busy}>הוספת עמודה</button>
    </form></Modal>}
    {actionItems&&<Modal actionSheet={editorContext} contextAnchor={editorContext?actionAnchor:null} title={actionItems.length===1?"פעולות: "+actionItems[0].title:actionItems.length+" מעקבים נבחרו"} close={()=>{if(!busy)setActionItems(null);}}>
      <div className={editorContext?"document-action-menu":"tracker-action-menu"}>
      {editorContext&&actionItems.length===1&&<button className="button secondary" disabled={busy} onClick={()=>{setActionItems(null);void open(actionItems[0],true);}}><Pencil size={18}/>עריכה / שינוי שם</button>}
      <button className="button secondary" disabled={busy} onClick={()=>{setActionItems(null);organize(actionItems);}}><FolderInput size={18}/>העברה לתיקייה</button>
      {actionItems.length===1&&cutEntry&&<button className="button secondary" disabled={busy} onClick={()=>{cutEntry(actionItems[0]);setActionItems(null);setNotice('בחר תיקיית יעד ולחץ על ״הדבקה כאן״.');}}><Scissors size={18}/>גזירה</button>}
      {actionItems.length===1&&<button className="button secondary" disabled={busy} onClick={()=>{setActionItems(null);askCopy(actionItems[0]);}}><Copy size={18}/>שכפול לשבוע נוסף</button>}
      <button className="button secondary document-danger tracker-delete" disabled={busy} onClick={()=>void manage(actionItems,'trash')}><Trash2 size={18}/>מחיקה</button>
      <button className="button secondary" disabled={busy} onClick={()=>setActionItems(null)}>ביטול</button></div></Modal>}
    {organizing&&<Modal title="העברת מעקבים לתיקייה" close={()=>{if(!busy)setOrganizing(null);}}><form onSubmit={e=>{e.preventDefault();const target=String(new FormData(e.currentTarget).get('folderId'));void manage(organizing,'move',target);}}><p>{organizing.length} מעקבים יועברו עם כל השמות, הקבצים והסימונים.</p><label>תיקיית יעד<select name="folderId" required disabled={busy} defaultValue=""><option value="" disabled>בחירת תיקייה</option>{destinations.filter(f=>f.id!==folderId).map(f=><option key={f.id} value={f.id}>{destinationPath(f.id)}</option>)}</select></label>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'מעביר…':'העברה לכאן'}</button></form></Modal>}
    {trashItems!==null&&<Modal title="נמחקו לאחרונה" close={()=>{if(!busy)setTrashItems(null);}}><p>המעקבים נשמרים כאן עד לשחזור. המחיקה אינה מוחקת את הקבצים לצמיתות.</p>{error&&<p role="alert">{error}</p>}{trashItems.length===0?<p>אין מעקבים שנמחקו.</p>:trashItems.map(e=><div key={e.id} className="document-toolbar"><strong>{e.title}</strong><button className="button secondary" disabled={busy} onClick={()=>void manage([e],'restore')}>שחזור</button></div>)}</Modal>}
    {creatingFolder&&<Modal title="תיקייה חדשה במעקבים" close={()=>{if(!busy)setCreatingFolder(false);}}><form onSubmit={async e=>{
      e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setError("");
      try{const r=await apiFetch('/api/documents/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.get('name'),parent:folderId,section:'library',clientRequestId:folderRequest.current})});const d=await r.json();if(!r.ok)throw Error(d.error);setCreatingFolder(false);setNotice('התיקייה נוספה');foldersChanged();}
      catch(e){setError(e instanceof Error?e.message:'לא ניתן ליצור תיקייה');}finally{setBusy(false);}
    }}><label>שם התיקייה<input name="name" required maxLength={120} disabled={busy}/></label><p>בתוך: {currentFolder?.name||'מעקבים'}</p>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'שומר…':'יצירת תיקייה'}</button></form></Modal>}
    {copy&&<Modal title="שכפול מעקב לשבוע נוסף" close={()=>{if(!busy)setCopy(null);}}><form onSubmit={async e=>{
      e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setError("");
      try{const r=await apiFetch(`/api/documents/${copy.id}/duplicate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:form.get('title'),folderId:form.get('folderId'),resetStatuses:form.get('resetStatuses')==='on',clientRequestId:copyRequest.current})});const d=await r.json();if(!r.ok)throw Error(d.error);setCopy(null);setNotice('העותק נשמר — המקור נשאר ללא שינוי');await load();window.dispatchEvent(new Event('samgad:saved'));}
      catch(e){setError(e instanceof Error?e.message:'לא ניתן לשכפל');}finally{setBusy(false);}
    }}><label>שם המעקב החדש<input name="title" required minLength={2} maxLength={160} defaultValue={`${copy.title.slice(0,140)} — שבוע נוסף`} disabled={busy}/></label><label>תיקיית היעד<select name="folderId" defaultValue={folderId} disabled={busy}>{destinations.map(f=><option key={f.id} value={f.id}>{destinationPath(f.id)}</option>)}</select></label><label><input type="checkbox" name="resetStatuses" defaultChecked disabled={busy}/> איפוס סימוני ✓ / ✗ בטבלה החדשה</label><p>כל השמות והתוכן יועתקו. בקובץ סרוק או באקסל מצורף יועתק הקובץ כפי שהוא.</p>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'מעתיק…':'יצירת עותק'}</button></form></Modal>}
    {creating&&<Modal title="מעקב חדש" close={()=>setCreating(false)}><form onSubmit={e=>{e.preventDefault();if(dirty&&!window.confirm("לעבור למעקב חדש ללא שמירת השינויים?"))return;const f=new FormData(e.currentTarget);fresh(String(f.get("title")),f.get("layout")==="company"?initialColumns:null);}}><label>שם הטבלה<input name="title" required minLength={2} maxLength={160}/></label><label>סוג טבלה<select name="layout" defaultValue="flexible"><option value="flexible">טבלה גמישה</option><option value="company">מעקב פלוגות עם סימון ✓ / ✗</option></select></label><p>בטבלה גמישה אפשר לערוך תאים, לסדר שורות ועמודות ולמזג תאים. במעקב פלוגות נשמר המבנה הקיים עם 50 שורות לפתיחה.</p><button className="button primary">יצירת טבלה</button> <button type="button" className="button secondary" onClick={()=>{setCreating(false);setAssisting(true);}}>תארו טבלה לעוזר</button></form></Modal>}
    {assisting&&canWrite&&<TrackerAssistant folder={currentFolder?.name||"מעקבים"} close={()=>setAssisting(false)} onPreview={({title,grid})=>{
      if(busy||!canWrite||(dirty&&!window.confirm("לעבור לתצוגה המקדימה בלי לשמור את השינויים הקודמים?")))return;
      fresh(title,null,grid);
    }}/>}
  </div>;
}
