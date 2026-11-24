"use client";

import {useRef,useState,type MouseEvent,type PointerEvent,type ReactNode} from 'react';
import {activitySwipeProgress,canDismissActivityWithSwipe} from '@/lib/activity-swipe';

type Gesture={pointer:number;x:number;y:number;intent:'pending'|'right'|'cancel'};

// Capture only after horizontal intent: normal taps and vertical scrolling stay native.
export function useRightSwipe<T extends HTMLElement>(onSwipe:()=>void,enabled=true){
 const gesture=useRef<Gesture|null>(null);
 const blockClick=useRef(false);
 function reset(event:PointerEvent<T>){
  if(gesture.current?.pointer===event.pointerId)gesture.current=null;
 }
 return {
  style:{touchAction:'pan-y pinch-zoom'},
  onPointerDown(event:PointerEvent<T>){
   if(!event.isPrimary){gesture.current=null;return;}
   blockClick.current=false;
   if(!enabled||event.button!==0||event.pointerType==='mouse')return;
   gesture.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,intent:'pending'};
  },
  onPointerMove(event:PointerEvent<T>){
   const start=gesture.current;
   if(!start||start.pointer!==event.pointerId||start.intent!=='pending')return;
   start.intent=activitySwipeProgress(event.clientX-start.x,event.clientY-start.y);
   if(start.intent!=='pending')blockClick.current=true;
   if(start.intent==='right')event.currentTarget.setPointerCapture?.(event.pointerId);
  },
  onPointerUp(event:PointerEvent<T>){
   const start=gesture.current;
   if(!start||start.pointer!==event.pointerId)return;
   reset(event);
   const dx=event.clientX-start.x,dy=event.clientY-start.y;
   if(start.intent==='cancel'||activitySwipeProgress(dx,dy)!=='pending')blockClick.current=true;
   if(enabled&&start.intent!=='cancel'&&canDismissActivityWithSwipe(dx,dy))onSwipe();
  },
  onPointerCancel:reset,
  onLostPointerCapture(event:PointerEvent<T>){
   if(event.target===event.currentTarget)reset(event);
  },
  onPointerLeave(event:PointerEvent<T>){
   if(!event.currentTarget.hasPointerCapture?.(event.pointerId))reset(event);
  },
  onClickCapture(event:MouseEvent<T>){
   if(blockClick.current&&event.detail>0){event.preventDefault();event.stopPropagation();blockClick.current=false;}
  },
 };
}

export default function HomeTaskPreview<T extends {href:string}>({tasks,renderTask}:{tasks:T[];renderTask:(task:T)=>ReactNode}){
 const [skipped,setSkipped]=useState<Set<string>>(()=>new Set());
 const current=tasks.find(task=>!skipped.has(task.href));
 function next(){
  if(current)setSkipped(previous=>new Set([...previous,current.href]));
 }
 const swipe=useRightSwipe<HTMLDivElement>(next,Boolean(current));
 function openTask(event:MouseEvent<HTMLDivElement>){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target instanceof Element?event.target.closest('a[href]'):null;
  if(!(link instanceof HTMLAnchorElement)||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
  const url=new URL(link.href,location.href);
  if(url.origin!==location.origin||url.pathname!==location.pathname)return;
  event.preventDefault();
  history.pushState({},'',url);
  window.scrollTo({top:0,behavior:'instant'});
  window.dispatchEvent(new PopStateEvent('popstate'));
 }
 return <>
  <div {...swipe} onClick={openTask} aria-live="polite" aria-atomic="true">
   {current?renderTask(current):<p className="empty">אין עוד משימות בתצוגה המקדימה</p>}
  </div>
  <button type="button" className="button secondary" aria-disabled={!current} onClick={next}>למשימה הבאה</button>
 </>;
}
