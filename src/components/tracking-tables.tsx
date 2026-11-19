"use client";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { apiFetch } from "@/lib/offline";
import {useTrackerDrag} from "./use-tracker-drag";
import { Modal } from "./workspace-primitives";
import { Plus } from "lucide-react";
import {
  INITIAL_TRACKING_ROWS, MAX_TRACKING_COLUMNS, MAX_TRACKING_ROWS, MAX_TRACKING_COLUMN_NAME,
  initialTrackingColumns as initialColumns, openTrackingSheet, addTrackingRow, appendTrackingColumn,
  type TrackingColumn as Column, type TrackingSheet as Sheet,
} from "@/lib/tracking-sheet";

type Entry = { id: string; title: string; version: number; creatorId: string; preview?:string; attachments?:{id:string;filename:string;byteSize:number}[] };
const initialTitle = "הסמכת תחמושת מתפצלת";
type Folder={id:string;name:string;parent:string|null;section:string};
export default function TrackingTables({userId,role,back,addFile,openFile,refreshKey,folderId,folders,navigate,foldersChanged,editAll=false,folderActions,cutEntry}:{editAll?:boolean;folderActions?:(folder:Folder)=>ReactNode;cutEntry?:(entry:Entry)=>void;userId:string;role:string;back:()=>void;addFile:()=>void;openFile:(id:string)=>void;refreshKey:number;folderId:string;folders:Folder[];navigate:(id:string)=>void;foldersChanged:()=>void}) {
  const manager = editAll || ["deputy","staff","company_commander"].includes(role);
  const canWrite = manager || role === "contributor";
  const [entries,setEntries]=useState<Entry[]>([]),[selected,setSelected]=useState<Entry|null>(null);
  const [sheet,setSheet]=useState<Sheet>({columns:initialColumns,rows:[]});
  const [title,setTitle]=useState(initialTitle);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[creating,setCreating]=useState(false);
  const requestId=useRef("");
  const [creatingFolder,setCreatingFolder]=useState(false);
  const [addingColumn,setAddingColumn]=useState(false),[columnError,setColumnError]=useState("");
  const tableScroll=useRef<HTMLDivElement>(null);
  const nextFocus=useRef<{row:number;keyboard:boolean}|{column:string}|null>(null);
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
  const [trashItems,setTrashItems]=useState<Entry[]|null>(null);
  const dragDrop=useTrackerDrag((ids,target)=>{void manage(entries.filter(e=>ids.includes(e.id)),'move',target);},ids=>setActionItems(entries.filter(e=>ids.includes(e.id))));
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
  function change(next:Sheet){setSheet(next);setDirty(true);setNotice("");}
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
  async function open(entry:Entry) {
    setBusy(true);setError("");
    try {const r=await apiFetch(`/api/documents/${entry.id}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);
      let parsed;try{parsed=JSON.parse(d.entry.body);}catch{parsed=null;}
      if(parsed?.kind!=="tracking-table-v1"){openFile(entry.id);return;}
      if(!Array.isArray(parsed.columns)||!Array.isArray(parsed.rows))throw new Error("הפריט אינו טבלת מעקב תקינה");
      if(dirty&&!window.confirm("יש שינויים שלא נשמרו. לצאת בלעדיהם?"))return;
      setActive(true);setSelected(d.entry);setTitle(d.entry.title);setSheet(openTrackingSheet(parsed));setDirty(false);setNotice("");
    }catch(e){setError(e instanceof Error?e.message:"לא ניתן לפתוח");}finally{setBusy(false);}
  }
  function fresh(name:string,columns:Column[]){setActive(true);requestId.current=crypto.randomUUID();setSelected(null);setTitle(name);setSheet({columns,rows:Array.from({length:INITIAL_TRACKING_ROWS},()=>({}))});setDirty(true);setCreating(false);setNotice("");}
  async function save(){setBusy(true);setError("");try{
    requestId.current ||= crypto.randomUUID();
    const body=JSON.stringify({kind:"tracking-table-v1",...sheet});if(body.length>100000)throw new Error("הטבלה גדולה מדי. יש לפצל למעקבים נוספים");
    const r=await apiFetch(selected?`/api/documents/${selected.id}`:"/api/documents",{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,body,folderId,...(selected?{version:selected.version}:{clientRequestId:requestId.current})})});
    const d=await r.json();if(!r.ok)throw new Error(d.error);
    setSelected({id:d.entry.id,title,creatorId:selected?.creatorId||userId,version:selected?selected.version+1:1});setDirty(false);setNotice("המעקב נשמר");await load();
  }catch(e){setError(e instanceof Error?e.message:"השמירה נכשלה");}finally{setBusy(false);}}
  return <div className="tracking-workspace">
    <div className="document-toolbar"><button className="button secondary" onClick={()=>{if(!dirty||window.confirm("לצאת ללא שמירת השינויים?"))back();}}>חזרה לספרייה</button><h2>{currentFolder?.name||"מעקבים"}</h2>{canWrite&&<button className="button secondary" disabled={busy} onClick={()=>void loadTrash().catch(e=>setError(e.message))}>נמחקו לאחרונה</button>}{folderId!=="trackers"&&<button className="button secondary" disabled={busy} onClick={()=>{if(!dirty||window.confirm("לצאת ללא שמירה?"))navigate(currentFolder?.parent||"trackers");}}>חזרה לתיקייה הקודמת</button>}{manager&&<button className="button secondary" disabled={busy} onClick={()=>{folderRequest.current=crypto.randomUUID();setCreatingFolder(true);}}>＋ תיקייה חדשה</button>}{canWrite&&<><button className="button secondary" disabled={busy} onClick={addFile}>הוספת קובץ סרוק / אקסל</button><button className="button primary" disabled={busy} onClick={()=>setCreating(true)}>＋ מעקב חדש</button></>}</div>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {canWrite&&<p className="muted">לחיצה ארוכה על מעקב וגרירה לתיקייה תעביר אותו לתוכה. לחיצה ארוכה ושחרור יפתחו תפריט פעולות.</p>}
    {dragDrop.drag&&<><div className="tracker-drop-tray" aria-label="תיקיות להעברה"><strong role="status">גרור לתיקייה ושחרר כדי להעביר</strong><div>{destinations.filter(f=>f.id!==folderId).map(f=><div key={f.id} data-tracker-drop={f.id} className={`tracker-drop-target ${dragDrop.drag?.target===f.id?'is-over':''}`}>📁 {destinationPath(f.id)}</div>)}</div></div><div className="tracker-drag-ghost" style={{left:Math.min(dragDrop.drag.x+12,window.innerWidth-200),top:Math.min(dragDrop.drag.y+16,window.innerHeight-70)}}>{dragDrop.drag.ids.length>1?`${dragDrop.drag.ids.length} מעקבים`:dragDrop.drag.title}</div></>}
    {canWrite&&entries.length>0&&<div className="document-toolbar"><button className="button secondary" disabled={busy} onClick={()=>setMarked(marked.length===entries.filter(mayManage).length?[]:entries.filter(mayManage).map(e=>e.id))}>{marked.length===entries.filter(mayManage).length?'ביטול בחירה':'בחירת הכול'}</button><span>{marked.length} נבחרו</span><button className="button primary" disabled={busy||!marked.length} onClick={()=>organize(entries.filter(e=>marked.includes(e.id)))}>העברה לתיקייה</button><button className="button secondary tracker-delete" disabled={busy||!marked.length} onClick={()=>void manage(entries.filter(e=>marked.includes(e.id)),'trash')}>מחיקה</button></div>}
    <div className="document-folder-grid">{subfolders.map(f=><div className="document-folder-shell" key={f.id}>{folderActions?.(f)}<button className={`document-folder-card ${dragDrop.drag?.target===f.id?"tracker-folder-over":""}`} data-tracker-drop={f.id} key={f.id} disabled={busy} onClick={()=>{if(!dirty||window.confirm("לצאת ללא שמירה?"))navigate(f.id);}}><strong>📁 {f.name}</strong><span>פתיחת תיקייה</span></button></div>)}{entries.map(e=><div key={e.id} className="tracking-entry-card">{canWrite&&mayManage(e)&&<label><input type="checkbox" disabled={busy} checked={marked.includes(e.id)} onChange={event=>setMarked(ids=>event.target.checked?[...ids,e.id]:ids.filter(id=>id!==e.id))}/> בחירת {e.title}</label>}<button disabled={busy} key={e.id} className={`document-folder-card tracker-draggable ${dragDrop.drag?.ids.includes(e.id)?'is-dragging':''}`} onPointerDown={event=>{if(canWrite&&mayManage(e)&&!busy)dragDrop.startMouse(event,dragIds(e),e.title);}} onTouchStart={event=>{if(canWrite&&mayManage(e)&&!busy)dragDrop.startTouch(event,dragIds(e),e.title);}} onContextMenu={event=>{if(canWrite){event.preventDefault();}}} onDragStart={event=>event.preventDefault()} onClick={()=>{if(!dragDrop.consumeClick())void open(e);}}><strong>{e.title}</strong><span>{e.attachments?.length?`${e.attachments.length} קבצים · פתיחה והורדה`:"פתיחת טבלה"}</span>{e.attachments?.map(file=><small key={file.id}>{file.filename}</small>)}</button>{canWrite&&<><button className="button secondary" disabled={busy||!mayManage(e)} onClick={()=>setActionItems([e])} aria-label={`פעולות עבור ${e.title}`}>••• פעולות</button><button className="button secondary" disabled={busy} onClick={()=>askCopy(e)}>שכפול / שבוע נוסף</button></>}</div>)}
    {folderId==="trackers"&&!loading&&!entries.some(e=>e.title===initialTitle)&&<button className="document-folder-card" disabled={!canWrite||busy} onClick={()=>{if(!dirty||window.confirm("להחליף את הטבלה שלא נשמרה?"))fresh(initialTitle,initialColumns);}}><strong>{initialTitle}</strong><span>טבלה מוכנה למילוי — שמירה תוסיף אותה למעקבים</span></button>}</div>
    {loading?<p role="status">טוען מעקבים…</p>:active?<section className="panel tracking-editor" aria-busy={busy}>
      <label>שם הטבלה<input value={title} maxLength={160} disabled={!editable||busy||Boolean(selected&&!manager&&selected.creatorId!==userId)} onChange={e=>{setTitle(e.target.value);setDirty(true);}} /></label>
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
        return <td key={c.id} style={{padding:0,border:"1px solid #64748b",background:status==="v"?"#bbf7d0":status==="x"?"#fecaca":"#fff",color:"#111827"}}><div style={{display:"flex",alignItems:"center"}}><input aria-label={`שם, ${c.name}, שורה ${index+1}`} style={{minWidth:120,width:"100%",height:36,border:0,borderRadius:0,background:"transparent",color:"inherit",padding:"4px 8px"}} maxLength={200} disabled={!editable||busy} value={row[c.id]||""} onChange={e=>change({...sheet,rows:sheet.rows.map((r,i)=>i===index?{...r,[c.id]:e.target.value}:r)})}/><select aria-label={`סימון, ${c.name}, שורה ${index+1}`} style={{minWidth:48,width:48,height:36,border:0,borderInlineStart:"1px solid #64748b",borderRadius:0,background:"transparent",color:"inherit",padding:2}} disabled={!editable||busy} value={status} onChange={e=>change({...sheet,rows:sheet.rows.map((r,i)=>i===index?{...r,[`${c.id}:status`]:e.target.value}:r)})}><option value="">—</option><option value="v">✓</option><option value="x">✗</option></select></div></td>;
      })}</tr>)}</tbody></table></div>
      {editable&&<div className="tracking-structure-footer"><button type="button" className="button secondary" disabled={busy||sheet.rows.length>=MAX_TRACKING_ROWS} onClick={addRow}><Plus aria-hidden="true" size={17}/> הוספת שורה בסוף הטבלה</button></div>}
      {editable&&(sheet.rows.length>=MAX_TRACKING_ROWS||sheet.columns.length>=MAX_TRACKING_COLUMNS)&&<p className="muted">עד {MAX_TRACKING_ROWS} שורות ו־{MAX_TRACKING_COLUMNS} עמודות במעקב. אפשר לפתוח מעקב נוסף.</p>}
      <div className="document-toolbar">{selected&&editable&&<button className="button secondary" disabled={busy} onClick={()=>askCopy(selected)}>שכפול לשבוע נוסף</button>}{editable&&<button className="button primary" disabled={busy||!dirty||title.trim().length<2} onClick={()=>void save()}>{busy?"שומר…":"שמירת המעקב"}</button>}</div>
      <small>המעקבים משותפים לבעלי הגישה לספרייה. העריכה לפי הרשאות הספרייה. השינויים נשמרים בלחיצה על שמירה.</small>
    </section>:<p>בחר טבלה או קובץ, או הוסף מעקב חדש כדי להתחיל.</p>}
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
    {actionItems&&<Modal title={actionItems.length===1?actionItems[0].title:`${actionItems.length} מעקבים נבחרו`} close={()=>{if(!busy)setActionItems(null);}}><div className="tracker-action-menu">{actionItems.length===1&&cutEntry&&<button className="button secondary" disabled={busy} onClick={()=>{cutEntry(actionItems[0]);setActionItems(null);setNotice('בחר תיקיית יעד ולחץ על ״הדבקה כאן״.');}}>גזירה</button>}<button className="button secondary" disabled={busy} onClick={()=>{setActionItems(null);organize(actionItems);}}>העברה לתיקייה</button>{actionItems.length===1&&<button className="button secondary" disabled={busy} onClick={()=>{setActionItems(null);askCopy(actionItems[0]);}}>שכפול לשבוע נוסף</button>}<button className="button secondary tracker-delete" disabled={busy} onClick={()=>void manage(actionItems,'trash')}>מחיקה</button><button className="button secondary" disabled={busy} onClick={()=>setActionItems(null)}>ביטול</button></div></Modal>}
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
    {creating&&<Modal title="מעקב חדש" close={()=>setCreating(false)}><form onSubmit={e=>{e.preventDefault();if(dirty&&!window.confirm("לעבור למעקב חדש ללא שמירת השינויים?"))return;const f=new FormData(e.currentTarget);fresh(String(f.get("title")),initialColumns);}}><label>שם הטבלה<input name="title" required minLength={2} maxLength={160}/></label><p>נקודת פתיחה: 50 שורות עם שם וסימון ✓ או ✗. אפשר להוסיף שורות ועמודות. עמודות פתיחה: א׳, ב׳, ג׳, ד׳, ה׳, צמ״ה ופלס״ם.</p><button className="button primary">יצירת טבלה</button></form></Modal>}
  </div>;
}
