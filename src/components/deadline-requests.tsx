'use client';
import {useState,useEffect,useCallback} from 'react';
type RequestRow={id:string;title:string;requesterName:string;originalDate:string|null;requestedDate:string;reason:string;status:string};
export function DeadlineRequests({manager}:{manager:boolean}){
 const [rows,setRows]=useState<RequestRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/deadline-requests',{cache:'no-store'});if(!r.ok)throw Error('לא ניתן לטעון בקשות הארכה');setRows(await r.json());setError('');}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void load();window.addEventListener('samgad:saved',load);return()=>window.removeEventListener('samgad:saved',load);},[load]);
 const pending=rows.filter(r=>r.status==='pending');
 if(!pending.length&&!error)return null;
 async function decide(id:string,approve:boolean){setBusy(id);try{const r=await fetch('/api/deadline-requests',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,approve})});const j=await r.json();if(!r.ok)throw Error(j.error);window.dispatchEvent(new Event('samgad:saved'));await load();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <section className="panel deadline-requests"><h2>בקשות הארכת תג״ב {pending.length>0&&`(${pending.length})`}</h2>{error&&<p role="alert">{error}</p>}{pending.map(r=><article key={r.id}><strong>{r.title}</strong><p>{r.requesterName}</p><p>מ־{r.originalDate||'ללא מועד'} ל־{r.requestedDate}</p><p>{r.reason}</p>{manager?<div className="dialog-actions"><button className="button primary" disabled={Boolean(busy)} onClick={()=>void decide(r.id,true)}>אשר הארכה</button><button className="button secondary" disabled={Boolean(busy)} onClick={()=>void decide(r.id,false)}>דחה</button></div>:<p>ממתין לאישור מנהל · התג״ב המקורי בתוקף</p>}</article>)}</section>;
}
