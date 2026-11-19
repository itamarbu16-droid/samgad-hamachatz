"use client";
import {useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {History,Trash2,Undo2} from 'lucide-react';
import {apiFetch} from '@/lib/offline';
import {activitySwipeProgress,canDismissActivityWithSwipe,ACTIVITY_SWIPE_DISTANCE} from '@/lib/activity-swipe';
import {Modal,Empty} from './workspace-primitives';
export type ActivityEntry={id:string;summary:string;action?:string;actorName?:string;createdAt:string};
type ActivityGesture={id:number;x:number;y:number;direction:'pending'|'right'};
function ActivityRow({item,removed,readOnly,busy,onAction}:{item:ActivityEntry;removed:boolean;readOnly:boolean;busy:boolean;onAction:()=>void}){
 const [offset,setOffset]=useState(0);
 const gesture=useRef<ActivityGesture|null>(null);
 const suppressClick=useRef(false);
 const swipeEnabled=!removed&&!readOnly&&!busy;
 function begin(event:PointerEvent<HTMLDivElement>){
  if(!event.isPrimary||event.button!==0)return;
  suppressClick.current=false;
  if(!swipeEnabled||(event.target as Element).closest('button,a,input,select,textarea,label'))return;
  gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,direction:'pending'};
 }
 function move(event:PointerEvent<HTMLDivElement>){
  const start=gesture.current;
  if(!start||start.id!==event.pointerId)return;
  if(!swipeEnabled){end(event,true);return;}
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(start.direction==='pending'){
   const intent=activitySwipeProgress(dx,dy);
   if(intent==='cancel'){gesture.current=null;return;}
   if(intent!=='right')return;
   start.direction='right';
   suppressClick.current=true;
   if(event.pointerType!=='touch')event.currentTarget.setPointerCapture(event.pointerId);
  }
  setOffset(Math.max(0,Math.min(dx,ACTIVITY_SWIPE_DISTANCE+10)));
 }
 function end(event:PointerEvent<HTMLDivElement>,cancelled=false){
  const start=gesture.current;
  if(!start||start.id!==event.pointerId)return;
  gesture.current=null;
  setOffset(0);
  if(swipeEnabled&&!cancelled&&start.direction==='right'&&canDismissActivityWithSwipe(event.clientX-start.x,event.clientY-start.y))onAction();
 }
 return <div className={swipeEnabled||offset?'activity-swipe-shell':undefined}
  onPointerDown={begin} onPointerMove={move} onPointerUp={end}
  onPointerCancel={event=>end(event,true)} onLostPointerCapture={event=>end(event,true)}
  onPointerLeave={event=>{if(event.pointerType==='mouse'&&gesture.current?.direction==='pending')end(event,true);}}
  onClickCapture={event=>{if(suppressClick.current&&event.detail>0){suppressClick.current=false;event.preventDefault();event.stopPropagation();}}}>
  {offset>0&&<div className="activity-swipe-underlay" aria-hidden="true"><Trash2 size={19}/></div>}
  <div className={`activity-item activity-manage-row${offset?' activity-swipe-dragging':''}`} style={offset?{'--activity-swipe-offset':`${offset}px`} as CSSProperties:undefined}>
   <span className="activity-icon"><History size={16}/></span>
   <div className="activity-copy"><strong>{item.summary||item.action}</strong><p>{item.actorName&&`${item.actorName} · `}<time>{new Date(item.createdAt).toLocaleDateString('he-IL')}</time></p></div>
   {!readOnly&&<button className="icon-button" type="button" aria-label={`${removed?'שחזור':'מחיקה מהרשימה'}: ${item.summary}`} title={removed?'שחזור עדכון':'מחיקה מהרשימה שלי'} disabled={busy} onClick={onAction}>{removed?<Undo2 size={18}/>:<Trash2 size={18}/>}</button>}
  </div>
 </div>;
}
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
  {items.length?<div className="activity-list">{items.map(item=><ActivityRow
   key={item.id} item={item} removed={removed} readOnly={readOnly} busy={busy}
   onAction={()=>{setError('');if(removed)void change(item,false);else setSelected(item);}}/>)}</div>:<Empty>{removed?'אין עדכונים שנמחקו מהרשימה.':'אין עדכונים חדשים להצגה.'}</Empty>}
  {selected&&<Modal title="מחיקת עדכון מהרשימה" close={()=>{if(!busy){setSelected(null);setError('');}}}>
   <p>{selected.summary}</p><p className="muted">העדכון יוסר מהרשימה שלך בלבד. הפריט המקורי והיסטוריית הפעילות יישמרו. ניתן להחזיר אותו דרך ״עדכונים שהוסרו״.</p>
   {error&&<p role="alert" className="form-error">{error}</p>}
   <div className="modal-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>void change(selected,true)}>{busy?'מוחק…':'מחיקה מהרשימה'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setSelected(null)}>ביטול</button></div>
  </Modal>}
 </>;
}
