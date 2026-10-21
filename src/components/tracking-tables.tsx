"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/offline";
import { Modal } from "./workspace-primitives";

type Column = { id: string; name: string; type: "text" | "date" | "status" };
type Sheet = { columns: Column[]; rows: Record<string, string>[]; previousLayout?: unknown };
type Entry = { id: string; title: string; version: number; creatorId: string };
const initialTitle = "הסמכת תחמושת מתפצלת";
const initialColumns: Column[] = [
  {id:"company-a",name:"א׳",type:"text"},
  {id:"company-b",name:"ב׳",type:"text"},
  {id:"company-c",name:"ג׳",type:"text"},
  {id:"company-d",name:"ד׳",type:"text"},
  {id:"company-e",name:"ה׳",type:"text"},
  {id:"company-engineering",name:"צמ״ה",type:"text"},
  {id:"company-support",name:"פלס״ם",type:"text"},
];
export default function TrackingTables({userId,role,back}:{userId:string;role:string;back:()=>void}) {
  const manager = ["deputy","staff","company_commander"].includes(role);
  const canWrite = manager || role === "contributor";
  const [entries,setEntries]=useState<Entry[]>([]),[selected,setSelected]=useState<Entry|null>(null);
  const [sheet,setSheet]=useState<Sheet>({columns:initialColumns,rows:[]});
  const [title,setTitle]=useState(initialTitle);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[creating,setCreating]=useState(false);
  const requestId=useRef("");
  const [active,setActive]=useState(false);
  async function load() {
    const response=await apiFetch("/api/documents",{cache:"no-store"});const data=await response.json();
    if(!response.ok)throw new Error(data.error);setEntries(data.entries.filter((e:Entry & {folderId:string})=>e.folderId==="trackers"));
  }
  useEffect(()=>{load().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  const editable=canWrite;
  function change(next:Sheet){setSheet(next);setDirty(true);setNotice("");}
  async function open(entry:Entry) {
    if(dirty&&!window.confirm("יש שינויים שלא נשמרו. לצאת בלעדיהם?"))return;
    setBusy(true);setError("");
    try {const r=await apiFetch(`/api/documents/${entry.id}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);
      const parsed=JSON.parse(d.entry.body);if(parsed.kind!=="tracking-table-v1"||!Array.isArray(parsed.columns)||!Array.isArray(parsed.rows))throw new Error("הפריט אינו טבלת מעקב תקינה");
      setActive(true);setSelected(d.entry);setTitle(d.entry.title);setSheet({...parsed,previousLayout:parsed.previousLayout || (parsed.columns.some((c:Column)=>!initialColumns.some(company=>company.id===c.id))?{columns:parsed.columns,rows:parsed.rows}:undefined),columns:initialColumns,rows:Array.from({length:Math.max(50,parsed.rows.length)},(_,i)=>parsed.rows[i]||{})});setDirty(false);setNotice("");
    }catch(e){setError(e instanceof Error?e.message:"לא ניתן לפתוח");}finally{setBusy(false);}
  }
  function fresh(name:string,columns:Column[]){setActive(true);requestId.current=crypto.randomUUID();setSelected(null);setTitle(name);setSheet({columns,rows:Array.from({length:50},()=>({}))});setDirty(true);setCreating(false);setNotice("");}
  async function save(){setBusy(true);setError("");try{
    requestId.current ||= crypto.randomUUID();
    const body=JSON.stringify({kind:"tracking-table-v1",...sheet});if(body.length>100000)throw new Error("הטבלה גדולה מדי. יש לפצל למעקבים נוספים");
    const r=await apiFetch(selected?`/api/documents/${selected.id}`:"/api/documents",{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,body,folderId:"trackers",...(selected?{version:selected.version}:{clientRequestId:requestId.current})})});
    const d=await r.json();if(!r.ok)throw new Error(d.error);
    setSelected({id:d.entry.id,title,creatorId:selected?.creatorId||userId,version:selected?selected.version+1:1});setDirty(false);setNotice("המעקב נשמר");await load();
  }catch(e){setError(e instanceof Error?e.message:"השמירה נכשלה");}finally{setBusy(false);}}
  return <div className="tracking-workspace">
    <div className="document-toolbar"><button className="button secondary" onClick={()=>{if(!dirty||window.confirm("לצאת ללא שמירת השינויים?"))back();}}>חזרה לספרייה</button><h2>מעקבים</h2>{canWrite&&<button className="button primary" disabled={busy} onClick={()=>setCreating(true)}>＋ מעקב חדש</button>}</div>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="document-folder-grid">{entries.map(e=><button disabled={busy} key={e.id} className="document-folder-card" onClick={()=>void open(e)}><strong>{e.title}</strong><span>פתיחת טבלה</span></button>)}
    {!loading&&!entries.some(e=>e.title===initialTitle)&&<button className="document-folder-card" disabled={!canWrite||busy} onClick={()=>{if(!dirty||window.confirm("להחליף את הטבלה שלא נשמרה?"))fresh(initialTitle,initialColumns);}}><strong>{initialTitle}</strong><span>טבלה מוכנה למילוי — שמירה תוסיף אותה למעקבים</span></button>}</div>
    {loading?<p role="status">טוען מעקבים…</p>:active?<section className="panel tracking-editor" aria-busy={busy}>
      <label>שם הטבלה<input value={title} maxLength={160} disabled={!editable||busy||Boolean(selected&&!manager&&selected.creatorId!==userId)} onChange={e=>{setTitle(e.target.value);setDirty(true);}} /></label>
      <p role="status">{sheet.rows.length} שורות{dirty?" · שינויים לא נשמרו":""}</p>
      <div className="tracking-scroll" style={{maxHeight:"65vh",border:"1px solid #64748b"}}><table style={{borderCollapse:"collapse"}}><thead style={{position:"sticky",top:0,zIndex:1,background:"#182235",color:"#fff"}}><tr><th scope="col" style={{minWidth:36}}>#</th>{initialColumns.map(c=><th key={c.id} scope="col">{c.name}</th>)}</tr></thead>
      <tbody>{sheet.rows.map((row,index)=><tr key={index}><th scope="row" style={{minWidth:36,padding:4,border:"1px solid #64748b"}}>{index+1}</th>{initialColumns.map(c=>{
        const status=row[`${c.id}:status`]||"";
        return <td key={c.id} style={{padding:0,border:"1px solid #64748b",background:status==="v"?"#bbf7d0":status==="x"?"#fecaca":"#fff",color:"#111827"}}><div style={{display:"flex",alignItems:"center"}}><input aria-label={`שם, ${c.name}, שורה ${index+1}`} style={{minWidth:120,width:"100%",height:36,border:0,borderRadius:0,background:"transparent",color:"inherit",padding:"4px 8px"}} maxLength={200} disabled={!editable||busy} value={row[c.id]||""} onChange={e=>change({...sheet,rows:sheet.rows.map((r,i)=>i===index?{...r,[c.id]:e.target.value}:r)})}/><select aria-label={`סימון, ${c.name}, שורה ${index+1}`} style={{minWidth:48,width:48,height:36,border:0,borderInlineStart:"1px solid #64748b",borderRadius:0,background:"transparent",color:"inherit",padding:2}} disabled={!editable||busy} value={status} onChange={e=>change({...sheet,rows:sheet.rows.map((r,i)=>i===index?{...r,[`${c.id}:status`]:e.target.value}:r)})}><option value="">—</option><option value="v">✓</option><option value="x">✗</option></select></div></td>;
      })}</tr>)}</tbody></table></div>
      <div className="document-toolbar">{editable&&<button className="button primary" disabled={busy||!dirty||title.trim().length<2} onClick={()=>void save()}>{busy?"שומר…":"שמירת המעקב"}</button>}</div>
      <small>המעקבים משותפים לבעלי הגישה לספרייה. העריכה לפי הרשאות הספרייה. השינויים נשמרים בלחיצה על שמירה.</small>
    </section>:<p>בחר מעקב או צור טבלה חדשה כדי להתחיל.</p>}
    {creating&&<Modal title="מעקב חדש" close={()=>setCreating(false)}><form onSubmit={e=>{e.preventDefault();if(dirty&&!window.confirm("לעבור למעקב חדש ללא שמירת השינויים?"))return;const f=new FormData(e.currentTarget);fresh(String(f.get("title")),initialColumns);}}><label>שם הטבלה<input name="title" required minLength={2} maxLength={160}/></label><p>50 שורות עם שם וסימון ✓ או ✗. עמודה לכל פלוגה: א׳, ב׳, ג׳, ד׳, ה׳, צמ״ה ופלס״ם.</p><button className="button primary">יצירת טבלה</button></form></Modal>}
  </div>;
}
