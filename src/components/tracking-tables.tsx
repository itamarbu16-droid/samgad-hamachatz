"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/offline";
import { Modal } from "./workspace-primitives";

type Column = { id: string; name: string; type: "text" | "date" | "status" };
type Sheet = { columns: Column[]; rows: Record<string, string>[] };
type Entry = { id: string; title: string; version: number; creatorId: string };
const initialTitle = "הסמכת תחמושת מתפצלת";
const initialColumns: Column[] = [
  {id:"name",name:"שם מלא",type:"text"}, {id:"company",name:"פלוגה",type:"text"},
  {id:"role",name:"תפקיד",type:"text"}, {id:"date",name:"תאריך הסמכה",type:"date"},
  {id:"status",name:"סטטוס",type:"status"}, {id:"notes",name:"הערות",type:"text"},
];
const statuses = ["טרם הוסמך", "בתהליך", "הוסמך"];
export default function TrackingTables({userId,role,back}:{userId:string;role:string;back:()=>void}) {
  const manager = ["deputy","staff","company_commander"].includes(role);
  const canWrite = manager || role === "contributor";
  const [entries,setEntries]=useState<Entry[]>([]),[selected,setSelected]=useState<Entry|null>(null);
  const [sheet,setSheet]=useState<Sheet>({columns:initialColumns,rows:[]});
  const [title,setTitle]=useState(initialTitle),[query,setQuery]=useState("");
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[creating,setCreating]=useState(false);
  const requestId=useRef("");
  const [active,setActive]=useState(false);
  async function load() {
    const response=await apiFetch("/api/documents",{cache:"no-store"});const data=await response.json();
    if(!response.ok)throw new Error(data.error);setEntries(data.entries.filter((e:Entry & {folderId:string})=>e.folderId==="trackers"));
  }
  useEffect(()=>{load().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  const editable=canWrite && (!selected || manager || selected.creatorId===userId);
  function change(next:Sheet){setSheet(next);setDirty(true);setNotice("");}
  async function open(entry:Entry) {
    if(dirty&&!window.confirm("יש שינויים שלא נשמרו. לצאת בלעדיהם?"))return;
    setBusy(true);setError("");
    try {const r=await apiFetch(`/api/documents/${entry.id}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);
      const parsed=JSON.parse(d.entry.body);if(parsed.kind!=="tracking-table-v1"||!Array.isArray(parsed.columns)||!Array.isArray(parsed.rows))throw new Error("הפריט אינו טבלת מעקב תקינה");
      setActive(true);setSelected(d.entry);setTitle(d.entry.title);setSheet(parsed);setDirty(false);setNotice("");setQuery("");
    }catch(e){setError(e instanceof Error?e.message:"לא ניתן לפתוח");}finally{setBusy(false);}
  }
  function fresh(name:string,columns:Column[]){setActive(true);requestId.current=crypto.randomUUID();setSelected(null);setTitle(name);setSheet({columns,rows:[]});setDirty(true);setCreating(false);setNotice("");setQuery("");}
  async function save(){setBusy(true);setError("");try{
    requestId.current ||= crypto.randomUUID();
    const body=JSON.stringify({kind:"tracking-table-v1",...sheet});if(body.length>100000)throw new Error("הטבלה גדולה מדי. יש לפצל למעקבים נוספים");
    const r=await apiFetch(selected?`/api/documents/${selected.id}`:"/api/documents",{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,body,folderId:"trackers",...(selected?{version:selected.version}:{clientRequestId:requestId.current})})});
    const d=await r.json();if(!r.ok)throw new Error(d.error);
    setSelected({id:d.entry.id,title,creatorId:selected?.creatorId||userId,version:selected?selected.version+1:1});setDirty(false);setNotice("המעקב נשמר");await load();
  }catch(e){setError(e instanceof Error?e.message:"השמירה נכשלה");}finally{setBusy(false);}}
  async function exportExcel(){try{const XLSX=await import("xlsx");const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([sheet.columns.map(c=>c.name),...sheet.rows.map(row=>sheet.columns.map(c=>row[c.id]||""))]),"מעקב");XLSX.writeFile(book,`${title}.xlsx`);}catch{setError("ייצוא הקובץ נכשל");}}
  async function importExcel(file:File){setBusy(true);setError("");try{
    if(file.size>5*1024*1024)throw new Error("אפשר לייבא קובץ עד 5 מ״ב");
    const XLSX=await import("xlsx");const book=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false});
    const rows=XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]],{header:1,raw:false,defval:""});
    const headers=rows.shift();if(!headers?.length||headers.length>30||rows.length>2000)throw new Error("נדרשת שורת כותרות, עד 30 עמודות ועד 2,000 שורות");
    if(sheet.rows.length&&!window.confirm("הייבוא יחליף את השורות והעמודות בטבלה הנוכחית. להמשיך?"))return;
    const columns:Column[]=headers.map((name,i)=>({id:`c${i}`,name:String(name||`עמודה ${i+1}`).slice(0,80),type:"text"}));
    change({columns,rows:rows.map(row=>Object.fromEntries(columns.map((c,i)=>[c.id,String(row[i]||"")])))});setNotice("הגיליון הראשון יובא. יש ללחוץ על שמירה");
  }catch(e){setError(e instanceof Error?e.message:"הייבוא נכשל");}finally{setBusy(false);}}
  return <div className="tracking-workspace">
    <div className="document-toolbar"><button className="button secondary" onClick={()=>{if(!dirty||window.confirm("לצאת ללא שמירת השינויים?"))back();}}>חזרה לספרייה</button><h2>מעקבים</h2>{canWrite&&<button className="button primary" disabled={busy} onClick={()=>setCreating(true)}>＋ מעקב חדש</button>}</div>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="document-folder-grid">{entries.map(e=><button disabled={busy} key={e.id} className="document-folder-card" onClick={()=>void open(e)}><strong>{e.title}</strong><span>פתיחת טבלה</span></button>)}
    {!loading&&!entries.some(e=>e.title===initialTitle)&&<button className="document-folder-card" disabled={!canWrite||busy} onClick={()=>{if(!dirty||window.confirm("להחליף את הטבלה שלא נשמרה?"))fresh(initialTitle,initialColumns);}}><strong>{initialTitle}</strong><span>טבלה מוכנה למילוי — שמירה תוסיף אותה למעקבים</span></button>}</div>
    {loading?<p role="status">טוען מעקבים…</p>:active?<section className="panel tracking-editor" aria-busy={busy}>
      <label>שם המעקב<input value={title} maxLength={160} disabled={!editable||busy} onChange={e=>{setTitle(e.target.value);setDirty(true);}} /></label>
      <div className="document-toolbar"><input aria-label="חיפוש בטבלה" placeholder="חיפוש בטבלה" value={query} onChange={e=>setQuery(e.target.value)}/><span>{sheet.rows.length} שורות {dirty?"· שינויים לא נשמרו":""}</span></div>
      <div className="tracking-scroll"><table><thead><tr>{sheet.columns.map((c,i)=><th key={c.id}><input aria-label={`שם עמודה ${i+1}`} disabled={!editable||busy} value={c.name} maxLength={80} onChange={e=>change({...sheet,columns:sheet.columns.map(col=>col.id===c.id?{...col,name:e.target.value}:col)})}/>{editable&&<select aria-label={`סוג עמודה ${c.name}`} value={c.type} disabled={busy} onChange={e=>change({...sheet,columns:sheet.columns.map(col=>col.id===c.id?{...col,type:e.target.value as Column["type"]}:col)})}><option value="text">טקסט</option><option value="date">תאריך</option><option value="status">סטטוס הסמכה</option></select>}{editable&&sheet.columns.length>1&&<button disabled={busy} type="button" onClick={()=>{if(window.confirm(`למחוק את העמודה ${c.name} ואת תוכנה?`))change({...sheet,columns:sheet.columns.filter(col=>col.id!==c.id),rows:sheet.rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!==c.id))) });}}>הסרת עמודה</button>}</th>)}{editable&&<th>פעולות</th>}</tr></thead>
      <tbody>{sheet.rows.map((row,index)=>({row,index})).filter(({row})=>Object.values(row).some(v=>v.includes(query))||!query).map(({row,index})=><tr key={index}>{sheet.columns.map(c=><td key={c.id}>{c.type==="status"?<select aria-label={`${c.name}, שורה ${index+1}`} disabled={!editable||busy} value={row[c.id]||""} onChange={e=>change({...sheet,rows:sheet.rows.map((r,i)=>i===index?{...r,[c.id]:e.target.value}:r)})}><option value="">בחירה</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>:<input aria-label={`${c.name}, שורה ${index+1}`} type={c.type==="date"?"date":"text"} maxLength={1000} disabled={!editable||busy} value={row[c.id]||""} onChange={e=>change({...sheet,rows:sheet.rows.map((r,i)=>i===index?{...r,[c.id]:e.target.value}:r)})}/>}</td>)}{editable&&<td><button className="button secondary" disabled={busy} onClick={()=>{if(window.confirm("למחוק את השורה?"))change({...sheet,rows:sheet.rows.filter((_,i)=>i!==index)});}}>מחיקה</button></td>}</tr>)}</tbody></table></div>
      {!sheet.rows.length&&<p>הטבלה ריקה. אפשר להוסיף שורה או לייבא אקסל.</p>}
      <div className="document-toolbar">{editable&&<><button className="button secondary" disabled={busy} onClick={()=>change({...sheet,rows:[...sheet.rows,{}]})}>＋ שורה</button><button className="button secondary" disabled={busy||sheet.columns.length>=30} onClick={()=>change({...sheet,columns:[...sheet.columns,{id:crypto.randomUUID(),name:"עמודה חדשה",type:"text"}]})}>＋ עמודה</button><label className="button secondary">ייבוא אקסל<input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void importExcel(f);e.target.value="";}}/></label><button className="button primary" disabled={busy||!dirty||title.trim().length<2||sheet.columns.some(c=>!c.name.trim())} onClick={()=>void save()}>{busy?"שומר…":"שמירת המעקב"}</button></>}<button className="button secondary" disabled={busy} onClick={()=>void exportExcel()}>ייצוא לאקסל</button></div>
      <small>המעקבים משותפים לבעלי הגישה לספרייה. העריכה לפי הרשאות הספרייה. השינויים נשמרים בלחיצה על שמירה.</small>
    </section>:<p>בחר מעקב או צור טבלה חדשה כדי להתחיל.</p>}
    {creating&&<Modal title="מעקב חדש" close={()=>setCreating(false)}><form onSubmit={e=>{e.preventDefault();if(dirty&&!window.confirm("לעבור למעקב חדש ללא שמירת השינויים?"))return;const f=new FormData(e.currentTarget);fresh(String(f.get("title")),[{id:"topic",name:"נושא",type:"text"},{id:"owner",name:"אחראי",type:"text"},{id:"date",name:"תאריך יעד",type:"date"},{id:"notes",name:"הערות",type:"text"}]);}}><label>שם המעקב<input name="title" required minLength={2} maxLength={160}/></label><p>אפשר לשנות את שמות העמודות ולהוסיף עמודות ושורות ישירות בטבלה.</p><button className="button primary">יצירת טבלה</button></form></Modal>}
  </div>;
}
