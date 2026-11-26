"use client";

import {useEffect,useRef,useState,type MouseEvent,type PointerEvent} from 'react';
import {activitySwipeProgress,canDismissActivityWithSwipe} from '@/lib/activity-swipe';

type Input={id:string;x:number;y:number;target:EventTarget|null};
type Gesture=Input&{intent:'pending'|'right'|'cancel'};
const EXIT_MS=300;
const PEEK_MS=150;
const controlSelector='button,input,select,textarea,label,summary,[role="button"]';

// Physical screen coordinates, independent of RTL reading order. Nothing
// moves before the gesture is clearly horizontal, preserving native scroll.
export function useSwipeCard<T extends HTMLElement>(onCommit:()=>void,{enabled=true,collapse=true,allowLink=false,commitOnUnmount=false}={}){
 const shell=useRef<T>(null);
 const [motion,setMotion]=useState({offset:0,phase:'idle'});
 const gesture=useRef<Gesture|null>(null),offset=useRef(0),blockClick=useRef(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const committing=useRef(false);
 const latest=useRef({onCommit,enabled});
 useEffect(()=>{latest.current={onCommit,enabled};},[onCommit,enabled]);
 useEffect(()=>()=>{
  if(!timer.current)return;
  clearTimeout(timer.current);timer.current=null;
  if(commitOnUnmount&&committing.current&&latest.current.enabled)latest.current.onCommit();
 },[commitOnUnmount]);
 function begin(sample:Input){
  if(committing.current)return;
  blockClick.current=false;
  gesture.current=null;
  if(!enabled||(sample.target instanceof Element&&sample.target.closest(controlSelector+(allowLink?'':',a'))))return;
  gesture.current={...sample,intent:'pending'};
 }
 function paint(value:number,phase:string){offset.current=value;setMotion({offset:value,phase});}
 function returnToRest(){
  gesture.current=null;
  paint(0,'return');
 }
 function drag(sample:Input){
  const start=gesture.current;
  if(!start||start.id!==sample.id||committing.current)return false;
  if(!enabled){returnToRest();return false;}
  const dx=sample.x-start.x,dy=sample.y-start.y;
  if(start.intent==='pending')start.intent=activitySwipeProgress(dx,dy);
  if(start.intent==='cancel'){blockClick.current=true;return false;}
  if(start.intent!=='right')return false;
  blockClick.current=true;
  paint(Math.max(0,Math.min(dx,shell.current?.clientWidth||360)),'drag');
  return true;
 }
 function commit(){
  if(!enabled||committing.current)return;
  gesture.current=null;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduced){paint(0,'idle');latest.current.onCommit();return;}
  committing.current=true;
  // Flush the last finger position before changing to the animated target.
  shell.current?.getBoundingClientRect();
  paint(collapse?(shell.current?.clientWidth||360)+12:Math.max(64,offset.current),'exit');
  timer.current=setTimeout(()=>{
   timer.current=null;
   committing.current=false;
   if(!collapse)paint(0,'return');
   if(latest.current.enabled)latest.current.onCommit();
  },collapse?EXIT_MS:PEEK_MS);
 }
 function finish(sample:Input,aborted=false){
  const start=gesture.current;
  if(!start||start.id!==sample.id)return;
  gesture.current=null;
  const dx=sample.x-start.x,dy=sample.y-start.y;
  if(start.intent!=='pending'||activitySwipeProgress(dx,dy)!=='pending')blockClick.current=true;
  if(!aborted&&start.intent!=='cancel'&&canDismissActivityWithSwipe(dx,dy))commit();
  else returnToRest();
 }
 // The native non-passive TouchEvent bridge prevents older Safari releases
 // from stealing an already-horizontal drag. Pointer-only browsers still work.
 const native=useRef({begin,drag,finish,returnToRest});
 useEffect(()=>{native.current={begin,drag,finish,returnToRest};});
 useEffect(()=>{
  const element=shell.current;if(!element)return;
  const sample=(event:TouchEvent,touch:Touch):Input=>({id:'t'+touch.identifier,x:touch.clientX,y:touch.clientY,target:event.target});
  const down=(event:TouchEvent)=>{
   if(event.touches.length!==1){native.current.returnToRest();return;}
   // Pointerdown, if any, precedes touchstart; the native touch now owns it.
   native.current.begin(sample(event,event.touches[0]));
  };
  const move=(event:TouchEvent)=>{
   const touch=Array.from(event.touches).find(touch=>'t'+touch.identifier===gesture.current?.id);
   if(touch&&native.current.drag(sample(event,touch))&&event.cancelable)event.preventDefault();
  };
  const end=(event:TouchEvent)=>{
   for(const touch of Array.from(event.changedTouches))native.current.finish(sample(event,touch),event.type==='touchcancel');
  };
  element.addEventListener('touchstart',down,{passive:true});
  element.addEventListener('touchmove',move,{passive:false});
  element.addEventListener('touchend',end);
  element.addEventListener('touchcancel',end);
  return()=>{
   element.removeEventListener('touchstart',down);element.removeEventListener('touchmove',move);
   element.removeEventListener('touchend',end);element.removeEventListener('touchcancel',end);
  };
 },[]);
 const pointer=(event:PointerEvent<T>):Input=>({id:'p'+event.pointerId,x:event.clientX,y:event.clientY,target:event.target});
 return {
  commit,
  phase:motion.phase,offset:motion.offset,
  moving:motion.phase==='drag'||motion.phase==='exit',
  shellProps:{
   ref:shell,
   onPointerDown(event:PointerEvent<T>){
    if(!event.isPrimary){returnToRest();return;}
    if(event.button===0)begin(pointer(event));
   },
   onPointerMove(event:PointerEvent<T>){
    if(drag(pointer(event))&&event.pointerType!=='touch'&&!event.currentTarget.hasPointerCapture?.(event.pointerId))
     event.currentTarget.setPointerCapture?.(event.pointerId);
   },
   onPointerUp(event:PointerEvent<T>){finish(pointer(event));},
   onPointerCancel(event:PointerEvent<T>){finish(pointer(event),true);},
   onPointerLeave(event:PointerEvent<T>){
    if(event.pointerType!=='touch'&&!event.currentTarget.hasPointerCapture?.(event.pointerId))finish(pointer(event),true);
   },
   onLostPointerCapture(event:PointerEvent<T>){
    if(event.target===event.currentTarget)finish(pointer(event),true);
   },
   onClickCapture(event:MouseEvent<T>){
    if((blockClick.current&&event.detail>0)||committing.current){
     event.preventDefault();event.stopPropagation();blockClick.current=false;
    }
   },
  },
 };
}
