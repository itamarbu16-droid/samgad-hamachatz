"use client";
import {useState} from 'react';
import {History,Trash2,Undo2} from 'lucide-react';
import {apiFetch} from '@/lib/offline';
import {Modal,Empty} from './workspace-primitives';
export type ActivityEntry={id:string;summary:string;action?:string;actorName?:string;createdAt:string};
export default function ActivityFeed({items,removed=false,onSaved,readOnly=false}:{items:ActivityEntry[];removed?:boolean;onSaved?:()=>void|Promise<void>;readOnly?:boolean}){
 const [selected,setSelected]=useState<ActivityEntry|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function change(item:ActivityEntry,dismissed:boolean){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const response=await apiFetch(`/api/activity/${encodeURIComponent(item.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({dismissed})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'הפעולה לא הושלמה');
   setSelected(null);await onSaved?.();
  }catch(e){setError(e instanceof Error?e.message:'הפעולה לא הושלמה');}finally{setBusy(false);}
 }
 return <>
  {error&&!selected&&<p role="alert" className="form-error">{error}</p>}
  {items.length?<div className="activity-list">{items.map(item=><div className="activity-item activity-manage-row" key={item.id}>
   <span className="activity-icon"><History size={16}/></span>
   <div className="activity-copy"><strong>{item.summary||item.action}</strong><p>{item.actorName&&`${item.actorName} · `}<time>{new Date(item.createdAt).toLocaleDateString('he-IL')}</time></p></div>
   {!readOnly&&<button className="icon-button" type="button" aria-label={`${removed?'שחזור':'מחיקה מהרשימה'}: ${item.summary}`} title={removed?'שחזור עדכון':'מחיקה מהרשימה שלי'} disabled={busy} onClick={()=>removed?void change(item,false):setSelected(item)}>{removed?<Undo2 size={18}/>:<Trash2 size={18}/>}</button>}
  </div>)}</div>:<Empty>{removed?'אין עדכונים שנמחקו מהרשימה.':'אין עדכונים חדשים להצגה.'}</Empty>}
  {selected&&<Modal title="מחיקת עדכון מהרשימה" close={()=>{if(!busy){setSelected(null);setError('');}}}>
   <p>{selected.summary}</p><p className="muted">העדכון יוסר מהרשימה שלך בלבד. המשימה והיסטוריית הפעילות יישמרו. ניתן להחזיר אותו דרך ״עדכונים שהוסרו״.</p>
   {error&&<p role="alert" className="form-error">{error}</p>}
   <div className="modal-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>void change(selected,true)}>{busy?'מוחק…':'מחיקה מהרשימה'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setSelected(null)}>ביטול</button></div>
  </Modal>}
 </>;
}
