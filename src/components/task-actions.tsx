"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {swipeIntent,swipeTarget,clampSwipe,renderedSwipeOffset} from '@/lib/task-swipe';
import {CalendarPlus,MoreHorizontal,Pin,PinOff,Trash2,CalendarClock} from 'lucide-react';
import {Modal} from './workspace-primitives';
import {addDays} from '@/lib/rhythm';
import {localDate} from '@/server/policy';
import {CalendarTaskDialog} from './task-calendar';
export type TaskActionRef={kind:'task'|'rhythm';id:string;occurrenceId?:string};
export type TaskActionProps={task:TaskActionRef;title:string;version:number;occurrenceVersion?:number;dueDate:string|null;pinned:boolean;canEdit:boolean;canDelete:boolean;canExtendDirectly?:boolean;recurring?:boolean;onSaved:()=>Promise<void>};
const rowKey=(task:TaskActionRef)=>`${task.kind}:${task.id}:${task.occurrenceId||''}`;
async function send(url:string,body:object){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error||'הפעולה לא נשמרה');return j;}
type SwipeAction = 'pin'|'delete'|'extend'|'calendar';
type SwipeRowProps = Pick<TaskActionProps,'task'|'title'|'pinned'|'canEdit'|'canDelete'|'canExtendDirectly'> & {className?:string;children:ReactNode;id?:string};
export function SwipeTaskRow({task,title,pinned,canEdit,canDelete,canExtendDirectly=false,className='',children,id}:SwipeRowProps){
 const root=useRef<HTMLDivElement>(null),front=useRef<HTMLDivElement>(null);
 const start=useRef<{x:number;y:number;id:number;base:number;rest:number;horizontal:boolean;lastX:number;lastTime:number;velocity:number}|null>(null);
 const offset=useRef(0),frame=useRef<number|null>(null),swiped=useRef(false);
 const [openSide,setOpenSide]=useState(0);
 const key=rowKey(task),rightWidth=canDelete?152:76,leftWidth=canEdit?152:76;
 // Movement is transient DOM state: React only updates when the card settles.
 const paint=useCallback((value:number,keepRail=false)=>{
  const element=root.current;if(!element)return;
  element.style.setProperty('--swipe-offset',`${value}px`);
  if(value||!keepRail){element.classList.toggle('is-revealing-right',value>0);element.classList.toggle('is-revealing-left',value<0);}
 },[]);
 const settle=useCallback((target:number)=>{
  if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}
  paint(offset.current,true);
  // Commit the last finger position before enabling the settle transition.
  if(root.current?.classList.contains('is-dragging'))front.current?.getBoundingClientRect();
  root.current?.classList.remove('is-dragging');
  root.current?.classList.toggle('is-open',target!==0);
  start.current=null;offset.current=target;paint(target,true);setOpenSide(Math.sign(target));
 },[paint]);
 const close=useCallback(()=>settle(0),[settle]);
 useEffect(()=>{
  const other=(event:Event)=>{if((event as CustomEvent).detail?.key!==key)close();};
  window.addEventListener('samgad:swipe-open',other);window.addEventListener('samgad:saved',close);
  return()=>{window.removeEventListener('samgad:swipe-open',other);window.removeEventListener('samgad:saved',close);if(frame.current!==null)cancelAnimationFrame(frame.current);};
 },[key,close]);
 useEffect(()=>{
  if(!openSide)return;
  const outside=(event:globalThis.PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[openSide,close]);
 function begin(event:PointerEvent<HTMLDivElement>){
  if(event.isPrimary)swiped.current=false;
  if(!event.isPrimary||event.button!==0||(event.target as HTMLElement).closest('input,select,textarea,label,.task-action-control'))return;
  const base=renderedSwipeOffset(getComputedStyle(event.currentTarget).transform,offset.current);
  root.current?.classList.add('is-dragging');paint(base,true);offset.current=base;
  start.current={x:event.clientX,y:event.clientY,id:event.pointerId,base,rest:offset.current,horizontal:false,lastX:event.clientX,lastTime:event.timeStamp,velocity:0};
 }
 function move(event:PointerEvent<HTMLDivElement>){
  const gesture=start.current;if(!gesture||gesture.id!==event.pointerId)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(!gesture.horizontal){
   const intent=swipeIntent(dx,dy);
   if(intent==='vertical'){start.current=null;root.current?.classList.remove('is-dragging');return;}
   if(intent!=='horizontal')return;
   gesture.horizontal=true;swiped.current=true;setOpenSide(0);
   root.current?.classList.add('is-dragging');
   // Child buttons may have implicit touch capture. Their bubbled capture-loss
   // event is not cancellation of the foreground's gesture.
   if(event.pointerType!=='touch')event.currentTarget.setPointerCapture(event.pointerId);
   window.dispatchEvent(new CustomEvent('samgad:swipe-open',{detail:{key}}));
  }
  const dt=event.timeStamp-gesture.lastTime;
  if(dt>0){gesture.velocity=(event.clientX-gesture.lastX)/dt;gesture.lastTime=event.timeStamp;gesture.lastX=event.clientX;}
  offset.current=clampSwipe(gesture.base+dx,rightWidth,leftWidth);
  if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;paint(offset.current);});
 }
 function finish(event:PointerEvent<HTMLDivElement>){
  const gesture=start.current;if(!gesture||gesture.id!==event.pointerId)return;
  if(!gesture.horizontal){start.current=null;root.current?.classList.remove('is-dragging');return;}
  const velocity=event.timeStamp-gesture.lastTime<100?gesture.velocity:0;
  const finalOffset=clampSwipe(gesture.base+event.clientX-gesture.x,rightWidth,leftWidth);
  settle(swipeTarget(finalOffset,rightWidth,leftWidth,velocity,gesture.base));
 }
 function cancel(event:PointerEvent<HTMLDivElement>){
  const gesture=start.current;
  if(gesture?.id===event.pointerId)settle(gesture.horizontal?swipeTarget(offset.current,rightWidth,leftWidth,0,gesture.base):gesture.rest);
 }
 // Native non-passive touchmove prevents Safari from stealing a horizontal drag
 // for vertical scrolling. Pointer events remain available for mouse and pen.
 const touchHandlers=useRef({begin,move,finish,cancel});
 useEffect(()=>{touchHandlers.current={begin,move,finish,cancel};});
 useEffect(()=>{
  const element=front.current;if(!element)return;
  const asPointer=(e:TouchEvent,t:Touch)=>({isPrimary:true,button:0,pointerType:'touch',pointerId:t.identifier,clientX:t.clientX,clientY:t.clientY,timeStamp:e.timeStamp,target:e.target,currentTarget:element}) as unknown as PointerEvent<HTMLDivElement>;
  const down=(e:TouchEvent)=>{if(e.touches.length===1)touchHandlers.current.begin(asPointer(e,e.touches[0]));};
  const drag=(e:TouchEvent)=>{const t=Array.from(e.touches).find(t=>t.identifier===start.current?.id);if(!t)return;touchHandlers.current.move(asPointer(e,t));if(start.current?.horizontal&&e.cancelable)e.preventDefault();};
  const up=(e:TouchEvent)=>{const t=Array.from(e.changedTouches).find(t=>t.identifier===start.current?.id);if(t)touchHandlers.current.finish(asPointer(e,t));};
  const abort=(e:TouchEvent)=>{const t=e.changedTouches[0];if(t)touchHandlers.current.cancel(asPointer(e,t));};
  element.addEventListener('touchstart',down,{passive:true});element.addEventListener('touchmove',drag,{passive:false});element.addEventListener('touchend',up);element.addEventListener('touchcancel',abort);
  return()=>{element.removeEventListener('touchstart',down);element.removeEventListener('touchmove',drag);element.removeEventListener('touchend',up);element.removeEventListener('touchcancel',abort);};
 },[]);
 function action(value:SwipeAction){close();window.dispatchEvent(new CustomEvent('samgad:task-action',{detail:{key,action:value}}));}
 return <div ref={root} id={id} className="swipe-task-shell"
  onKeyDown={event=>{if(event.key==='Escape')close();}}
  onClickCapture={event=>{
   if(!(event.target as HTMLElement).closest('.swipe-task-front'))return;
   if(swiped.current){event.preventDefault();event.stopPropagation();swiped.current=false;return;}
   if(offset.current){event.preventDefault();event.stopPropagation();close();}
  }}>
  <div className="task-underlay task-underlay-right" role="group" aria-label={`הצמדה ומחיקה: ${title}`} aria-hidden={openSide!==1} inert={openSide!==1}>
   {canDelete&&<button type="button" className="swipe-delete" aria-label={`מחיקת ${title}`} onClick={()=>action('delete')}><Trash2 size={24}/><span>מחיקה</span></button>}
   <button type="button" className="swipe-pin" aria-label={`${pinned?'ביטול הצמדת':'הצמדת'} ${title}`} onClick={()=>action('pin')}>{pinned?<PinOff size={24}/>:<Pin size={24}/>}<span>{pinned?'בטל הצמדה':'הצמדה'}</span></button>
  </div>
  <div className="task-underlay task-underlay-left" role="group" aria-label={`תג״ב ויומן: ${title}`} aria-hidden={openSide!==-1} inert={openSide!==-1}>
   {canEdit&&<button type="button" className="swipe-extend" aria-label={`${canExtendDirectly?'הארכת תג״ב':'בקשת הארכת תג״ב'}: ${title}`} onClick={()=>action('extend')}><CalendarClock size={24}/><span>{canExtendDirectly?'הארך תג״ב':'בקש הארכה'}</span></button>}
   <button type="button" className="swipe-calendar" aria-label={`הוספת ${title} ליומן`} onClick={()=>action('calendar')}><CalendarPlus size={24}/><span>הוסף ליומן</span></button>
  </div>
  <div ref={front} className={`${className} swipe-task-front`} onPointerDown={e=>{if(e.pointerType!=='touch')begin(e);}} onPointerMove={e=>{if(e.pointerType!=='touch')move(e);}} onPointerUp={e=>{if(e.pointerType!=='touch')finish(e);}} onPointerCancel={e=>{if(e.pointerType!=='touch')cancel(e);}}
   onLostPointerCapture={event=>{if(event.pointerType!=='touch'&&event.target===event.currentTarget)cancel(event);}}
   onTransitionEnd={event=>{if(event.target===event.currentTarget&&event.propertyName==='transform'&&!offset.current)paint(0);}}>{children}</div>
 </div>;
}
export function TaskActions(props:TaskActionProps & {children?:ReactNode}){
 const {task,title,version,occurrenceVersion,dueDate,pinned,canEdit,canDelete,canExtendDirectly=false,recurring,onSaved}=props;
 const [menu,setMenu]=useState(''),[dialog,setDialog]=useState(''),[date,setDate]=useState(addDays(dueDate&&dueDate>localDate()?dueDate:localDate(),1)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reason,setReason]=useState('');
 const key=rowKey(task);
 const act=useCallback(async (action:'pin'|'delete'|'extend')=>{
  setBusy(true);setError('');
  try{const result=await send(action==='extend'&&!canExtendDirectly?'/api/deadline-requests':'/api/task-actions',action==='extend'&&!canExtendDirectly?{...task,date,reason}:{...task,version,occurrenceVersion,action,...(action==='pin'?{pinned:!pinned}:action==='extend'?{date}:{})});
   setDialog('');setMenu('');
   window.dispatchEvent(new CustomEvent('samgad:task-notice',{detail:{title,message:action==='delete'?'המשימה נמחקה':action==='pin'?(pinned?'ההצמדה בוטלה':'המשימה הוצמדה לראש הרשימה'):canExtendDirectly?'התג״ב עודכן':'בקשת ההארכה נשלחה לאישור; התג״ב המקורי בתוקף',undoToken:result.undoToken}}));
   window.dispatchEvent(new Event('samgad:saved'));await onSaved();
  }catch(error){setError(error instanceof Error?error.message:'לא ניתן להשלים את הפעולה');}finally{setBusy(false);}
 },[task,version,occurrenceVersion,pinned,date,title,onSaved,canExtendDirectly,reason]);
 useEffect(()=>{
  const open=(event:Event)=>{
   const detail=(event as CustomEvent).detail;if(detail.key!==key)return;
   setError('');setMenu('');
   if(detail.action==='pin')void act('pin');
   else if(detail.action==='delete'&&canDelete)setDialog('delete');
   else if(detail.action==='extend'&&canEdit){setDate(addDays(dueDate&&dueDate>localDate()?dueDate:localDate(),1));setDialog('extend');}
   else if(detail.action==='calendar')setDialog('calendar');
  };
  window.addEventListener('samgad:task-action',open);return()=>window.removeEventListener('samgad:task-action',open);
 },[key,act,canDelete,canEdit,dueDate]);
 return <div className="task-action-control">
  <button type="button" className="icon-button task-options" aria-label={`אפשרויות למשימה ${title}`} aria-haspopup="dialog" aria-expanded={Boolean(menu)} onClick={()=>setMenu(menu?'':'all')}><MoreHorizontal size={22}/></button>
  {(menu||dialog||error)&&createPortal(<>
  {menu&&<Modal title="פעולות משימה" close={()=>setMenu('')}><p className="task-menu-title">{title}</p><div className="task-action-menu" role="group" aria-label={`פעולות עבור ${title}`}>
   <button className="swipe-pin" disabled={busy} onClick={()=>void act('pin')}>{pinned?<PinOff size={21}/>:<Pin size={21}/>} {pinned?'בטל הצמדה':'הצמד לראש'}</button>
   {canDelete&&<button className="swipe-delete" disabled={busy} onClick={()=>{setError('');setMenu('');setDialog('delete');}}><Trash2 size={21}/>מחיקה</button>}
   {canEdit&&<button className="swipe-extend" disabled={busy} onClick={()=>{setError('');setMenu('');setDate(addDays(dueDate&&dueDate>localDate()?dueDate:localDate(),1));setDialog('extend');}}><CalendarClock size={21}/>{canExtendDirectly?'הארך תג״ב':'בקש הארכת תג״ב'}</button>}
   <button className="swipe-calendar" disabled={busy} onClick={()=>{setError('');setMenu('');setDialog('calendar');}}><CalendarPlus size={21}/>הוסף ליומן</button>
  </div>{props.children&&<div className="task-extra-actions" onClick={event=>{if((event.target as HTMLElement).closest('button'))setMenu('');}}>{props.children}</div>}{error&&<p className="task-action-error" role="alert">{error}</p>}</Modal>}
  {error&&!menu&&!dialog&&<Modal title="הפעולה לא הושלמה" close={()=>setError('')}><p className="task-action-error" role="alert">{error}</p></Modal>}
  {dialog==='delete'&&<Modal title="למחוק את המשימה?" close={()=>{if(!busy)setDialog('');}}><p>{title}</p>{recurring&&<p>זו משימה חוזרת. המחיקה תסיר את כל המופעים שלה.</p>}<p>אפשר לבטל את המחיקה מיד אחרי הפעולה.</p>{error&&<p role="alert" className="task-action-error">{error}</p>}<div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={()=>setDialog('')}>השאר משימה</button><button className="button danger" disabled={busy} onClick={()=>void act('delete')}>{busy?'מוחק…':'מחיקה'}</button></div></Modal>}
  {dialog==='extend'&&<Modal title={canExtendDirectly?'הארכת תג״ב':'בקשת הארכת תג״ב'} close={()=>{if(!busy)setDialog('');}}><p>{title}</p>{recurring&&<p>השינוי יחול על המופע הזה בלבד, בלי לשנות את מחזור המשימה.</p>}<form onSubmit={event=>{event.preventDefault();void act('extend');}}><label>תג״ב חדש<input required type="date" min={dueDate?addDays(dueDate,1):undefined} value={date} onChange={e=>setDate(e.target.value)}/></label>{!canExtendDirectly&&<><p>התג״ב המקורי נשאר בתוקף עד לאישור המנהל.</p><label>סיבת ההארכה<textarea required minLength={2} maxLength={1500} value={reason} onChange={e=>setReason(e.target.value)}/></label></>}<div className="deadline-shortcuts"><button type="button" className="button secondary" onClick={()=>setDate(addDays(dueDate||localDate(),1))}>יום נוסף</button><button type="button" className="button secondary" onClick={()=>setDate(addDays(dueDate||localDate(),7))}>שבוע נוסף</button></div>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'שומר…':canExtendDirectly?'עדכן תג״ב':'שלח בקשה לאישור'}</button></form></Modal>}
  {dialog==='calendar'&&<Modal title="הוספה ל-Google Calendar" close={()=>setDialog('')}><CalendarTaskDialog task={task} title={title} dueDate={dueDate}/></Modal>}
 </>,document.body)}
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
