"use client";
import {createElement,useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {CalendarPlus,MoreHorizontal,Pin,PinOff,Trash2,CalendarClock,X} from 'lucide-react';
import {Modal} from './workspace-primitives';
import {addDays} from '@/lib/rhythm';
import {localDate} from '@/server/policy';
import {CalendarTaskDialog} from './task-calendar';
export type TaskActionRef={kind:'task'|'rhythm';id:string;occurrenceId?:string};
export type TaskActionProps={task:TaskActionRef;title:string;version:number;occurrenceVersion?:number;dueDate:string|null;pinned:boolean;canEdit:boolean;canDelete:boolean;recurring?:boolean;onSaved:()=>Promise<void>};
const rowKey=(task:TaskActionRef)=>`${task.kind}:${task.id}:${task.occurrenceId||''}`;
async function send(url:string,body:object){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'הפעולה לא נשמרה');return j;}
export function SwipeTaskRow({as='div',task,className='',children,id}:{as?:'div'|'tr';task:TaskActionRef;className?:string;children:ReactNode;id?:string}){
 const start=useRef<{x:number;y:number;id:number}|null>(null),swiped=useRef(false);
 const handlers={
  onPointerDown:(event:PointerEvent<HTMLElement>)=>{if(event.pointerType==='mouse'||(event.target as HTMLElement).closest('input,select,textarea,label,.task-action-control'))return;start.current={x:event.clientX,y:event.clientY,id:event.pointerId};swiped.current=false;},
  onPointerMove:(event:PointerEvent<HTMLElement>)=>{if(!start.current)return;const dx=event.clientX-start.current.x,dy=event.clientY-start.current.y;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12){start.current=null;return;}if(Math.abs(dx)>20&&Math.abs(dx)>Math.abs(dy)*1.5){swiped.current=true;event.currentTarget.setPointerCapture(event.pointerId);}},
  onPointerUp:(event:PointerEvent<HTMLElement>)=>{if(start.current){const dx=event.clientX-start.current.x,dy=event.clientY-start.current.y;if(Math.abs(dx)>=55&&Math.abs(dx)>Math.abs(dy)*1.5)window.dispatchEvent(new CustomEvent('samgad:task-swipe',{detail:{key:rowKey(task),direction:dx>0?'right':'left'}}));}start.current=null;},
  onPointerCancel:()=>{start.current=null;swiped.current=false;},
  onClickCapture:(event:React.MouseEvent<HTMLElement>)=>{if(swiped.current){event.preventDefault();event.stopPropagation();swiped.current=false;}},
 };
 return createElement(as,{...handlers,id,className:`${className} swipe-task-row`},children);
}
export function TaskActions(props:TaskActionProps){
 const {task,title,version,occurrenceVersion,dueDate,pinned,canEdit,canDelete,recurring,onSaved}=props;
 const [menu,setMenu]=useState(''),[dialog,setDialog]=useState(''),[date,setDate]=useState(addDays(dueDate&&dueDate>localDate()?dueDate:localDate(),1)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=rowKey(task);
 useEffect(()=>{const open=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.key===key)setMenu(detail.direction);else setMenu('');};window.addEventListener('samgad:task-swipe',open);return()=>window.removeEventListener('samgad:task-swipe',open);},[key]);
 async function act(action:'pin'|'delete'|'extend'){
  setBusy(true);setError('');
  try{const result=await send('/api/task-actions',{...task,version,occurrenceVersion,action,...(action==='pin'?{pinned:!pinned}:action==='extend'?{date}:{})});
   setDialog('');setMenu('');
   window.dispatchEvent(new CustomEvent('samgad:task-notice',{detail:{title,message:action==='delete'?'המשימה נמחקה':action==='pin'?(pinned?'ההצמדה בוטלה':'המשימה הוצמדה לראש הרשימה'):'התג״ב עודכן',undoToken:result.undoToken}}));
   window.dispatchEvent(new Event('samgad:saved'));await onSaved();
  }catch(error){setError(error instanceof Error?error.message:'לא ניתן להשלים את הפעולה');}finally{setBusy(false);}
 }
 return <div className="task-action-control">
  <button type="button" className="icon-button task-options" aria-label={`אפשרויות למשימה ${title}`} aria-expanded={Boolean(menu)} onClick={()=>setMenu(menu?'':'all')}><MoreHorizontal size={22}/></button>
  {menu&&<div className="task-action-menu" role="group" aria-label={`פעולות עבור ${title}`}>
   {menu!=='left'&&<><button disabled={busy} onClick={()=>void act('pin')}>{pinned?<PinOff size={19}/>:<Pin size={19}/>} {pinned?'בטל הצמדה':'הצמד לראש'}</button>{canDelete&&<button className="danger-action" disabled={busy} onClick={()=>{setError('');setDialog('delete');}}><Trash2 size={19}/>מחיקה</button>}</>}
   {menu!=='right'&&<>{canEdit&&<button disabled={busy} onClick={()=>{setError('');setDate(addDays(dueDate&&dueDate>localDate()?dueDate:localDate(),1));setDialog('extend');}}><CalendarClock size={19}/>הארך תג״ב</button>}<button disabled={busy} onClick={()=>{setError('');setDialog('calendar');}}><CalendarPlus size={19}/>הוסף ליומן</button></>}
   <button className="icon-button" aria-label="סגירת פעולות משימה" onClick={()=>setMenu('')}><X size={18}/></button>
  </div>}
  {error&&<p className="task-action-error" role="alert">{error}</p>}
  {dialog==='delete'&&<Modal title="למחוק את המשימה?" close={()=>{if(!busy)setDialog('');}}><p>{title}</p>{recurring&&<p>זו משימה חוזרת. המחיקה תסיר את כל המופעים שלה.</p>}<p>אפשר לבטל את המחיקה מיד אחרי הפעולה.</p>{error&&<p role="alert" className="task-action-error">{error}</p>}<div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={()=>setDialog('')}>השאר משימה</button><button className="button danger" disabled={busy} onClick={()=>void act('delete')}>{busy?'מוחק…':'מחיקה'}</button></div></Modal>}
  {dialog==='extend'&&<Modal title="הארכת תג״ב" close={()=>{if(!busy)setDialog('');}}><p>{title}</p>{recurring&&<p>השינוי יחול על המופע הזה בלבד, בלי לשנות את מחזור המשימה.</p>}<form onSubmit={event=>{event.preventDefault();void act('extend');}}><label>תג״ב חדש<input required type="date" min={dueDate?addDays(dueDate,1):undefined} value={date} onChange={e=>setDate(e.target.value)}/></label><div className="deadline-shortcuts"><button type="button" className="button secondary" onClick={()=>setDate(addDays(dueDate||localDate(),1))}>יום נוסף</button><button type="button" className="button secondary" onClick={()=>setDate(addDays(dueDate||localDate(),7))}>שבוע נוסף</button></div>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'שומר…':'עדכן תג״ב'}</button></form></Modal>}
  {dialog==='calendar'&&<Modal title="הוספה ל-Google Calendar" close={()=>setDialog('')}><CalendarTaskDialog task={task} title={title} dueDate={dueDate}/></Modal>}
 </div>;
}
export function TaskActionNotice(){
 const [message,setMessage]=useState(''),[undos,setUndos]=useState<{token:string;title:string;expires:number}[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{const show=(e:Event)=>{const data=(e as CustomEvent).detail;setMessage(data.message);if(data.undoToken)setUndos(old=>[...old,{token:data.undoToken,title:data.title||'משימה',expires:Date.now()+60000}]);};window.addEventListener('samgad:task-notice',show);return()=>window.removeEventListener('samgad:task-notice',show);},[]);
 useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),6000);return()=>clearTimeout(timer);},[message]);
 useEffect(()=>{if(!undos.length)return;const timer=setInterval(()=>setUndos(old=>old.filter(u=>u.expires>Date.now())),1000);return()=>clearInterval(timer);},[undos.length]);
 if(!message&&!undos.length)return null;
 const undo=undos.at(-1);
 return <div className="quick-notice task-action-notice" role="status">{message||`${undos.length} פעולות ניתנות לביטול`}{undo&&<button disabled={busy} aria-label={`בטל פעולה: ${undo.title}`} onClick={async()=>{setBusy(true);try{await send('/api/rhythm/undo',{token:undo.token});window.dispatchEvent(new Event('samgad:saved'));setUndos(old=>old.filter(u=>u.token!==undo.token));setMessage('הפעולה בוטלה');}catch(error){setMessage(error instanceof Error?error.message:'לא ניתן לבטל כרגע');}finally{setBusy(false);}}}>בטל פעולה אחרונה</button>}</div>;
}
