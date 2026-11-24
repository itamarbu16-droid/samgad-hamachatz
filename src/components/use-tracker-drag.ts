"use client";
import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent,TouchEvent as ReactTouchEvent} from 'react';

type Drag = {ids:string[];title:string;x:number;y:number;target:string|null};
type Pending = {ids:string[];title:string;x:number;y:number;touchId:number|null;moved:boolean;holdId?:string;anchor?:HTMLElement};
export function useTrackerDrag(onDrop:(ids:string[],folderId:string)=>void,onHold?:(ids:string[],anchor?:HTMLElement)=>void){
 const [drag,setDrag]=useState<Drag|null>(null);
 const active=useRef<Drag|null>(null),pending=useRef<Pending|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const suppressClick=useRef(false),drop=useRef(onDrop),hold=useRef(onHold);
 drop.current=onDrop;hold.current=onHold;
 function clearTimer(){if(timer.current)clearTimeout(timer.current);timer.current=null;}
 function begin(ids:string[],title:string,x:number,y:number,touchId:number|null,holdId?:string,anchor?:HTMLElement){
  clearTimer();suppressClick.current=false;pending.current={ids,title,x,y,touchId,moved:false,holdId,anchor};
  timer.current=setTimeout(()=>{
   const p=pending.current;if(!p)return;
   suppressClick.current=true;active.current={ids:p.ids,title:p.title,x:p.x,y:p.y,target:null};setDrag(active.current);
  },450);
 }
 useEffect(()=>{
  function targetAt(x:number,y:number){return document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-tracker-drop]')?.dataset.trackerDrop??null;}
  function move(x:number,y:number,event:Event){
   const p=pending.current;if(!p)return;
   if(!active.current){if(Math.hypot(x-p.x,y-p.y)>10){clearTimer();pending.current=null;}return;}
   if(Math.hypot(x-p.x,y-p.y)>10)p.moved=true;
   if(event.cancelable)event.preventDefault();
   active.current={...active.current,x,y,target:targetAt(x,y)};setDrag(active.current);
  }
  function finish(cancelled=false,end?:{x:number;y:number}){
   clearTimer();const current=active.current;const origin=pending.current;pending.current=null;active.current=null;setDrag(null);
   if(current&&origin&&!cancelled){
    const position=end??current;
    const shifted=Math.hypot(position.x-origin.x,position.y-origin.y)>10;
    const target=shifted?targetAt(position.x,position.y):null;
    if(target)drop.current(current.ids,target);
    else if(!shifted&&!origin.moved){
     const ids=origin.holdId?[origin.holdId]:current.ids;
     if(origin.anchor)hold.current?.(ids,origin.anchor);else hold.current?.(ids);
    }
   }
  }
  const mouseMove=(e:PointerEvent)=>{if(e.pointerType==='mouse')move(e.clientX,e.clientY,e);};
  const mouseEnd=(e:PointerEvent)=>{if(e.pointerType==='mouse')finish(false,{x:e.clientX,y:e.clientY});};
  const touchMove=(e:TouchEvent)=>{const touch=Array.from(e.touches).find(t=>t.identifier===pending.current?.touchId);if(touch)move(touch.clientX,touch.clientY,e);};
  const touchEnd=(e:TouchEvent)=>{const touch=Array.from(e.changedTouches).find(t=>t.identifier===pending.current?.touchId);if(touch)finish(false,{x:touch.clientX,y:touch.clientY});};
  const cancel=()=>finish(true);
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel();};
  document.addEventListener('pointermove',mouseMove,{passive:false});document.addEventListener('pointerup',mouseEnd);
  document.addEventListener('touchmove',touchMove,{passive:false});document.addEventListener('touchend',touchEnd);document.addEventListener('touchcancel',cancel);
  document.addEventListener('keydown',key);window.addEventListener('blur',cancel);
  return ()=>{clearTimer();document.removeEventListener('pointermove',mouseMove);document.removeEventListener('pointerup',mouseEnd);document.removeEventListener('touchmove',touchMove);document.removeEventListener('touchend',touchEnd);document.removeEventListener('touchcancel',cancel);document.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);};
 },[]);
 useEffect(()=>{
  if(!drag)return;
  const interval=setInterval(()=>{const d=active.current;if(!d||!pending.current?.moved)return;const delta=d.y>window.innerHeight-90?14:d.y<90?-14:0;if(delta)window.scrollBy(0,delta);},30);
  return ()=>clearInterval(interval);
 },[Boolean(drag)]);
 return {drag,
  consumeClick(){if(!suppressClick.current)return false;suppressClick.current=false;return true;},
  startMouse(e:ReactPointerEvent,ids:string[],title:string,holdId?:string){if(e.pointerType==='mouse'&&e.button===0)begin(ids,title,e.clientX,e.clientY,null,holdId,e.currentTarget as HTMLElement);},
  startTouch(e:ReactTouchEvent,ids:string[],title:string,holdId?:string){if(e.touches.length!==1)return;const t=e.touches[0];begin(ids,title,t.clientX,t.clientY,t.identifier,holdId,e.currentTarget as HTMLElement);},
 };
}
