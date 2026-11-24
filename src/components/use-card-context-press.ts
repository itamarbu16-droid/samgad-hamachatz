"use client";
import {useRef,type KeyboardEvent,type MouseEvent,type PointerEvent} from "react";

type Press = {target:HTMLElement;id:number;x:number;y:number;start:number};
const moveLimit=10;
const holdTime=480;

/** A stationary hold opens on release, leaving ordinary touch scrolling alone. */
export function useCardContextPress(){
 const pending=useRef<Press|null>(null);
 const swallowed=useRef<{target:HTMLElement;until:number}|null>(null);
 return (open:((target:HTMLElement)=>void)|false) => {
  if(!open)return {};
  return {
    onPointerDown(event:PointerEvent<HTMLElement>){
      pending.current=null;swallowed.current=null;
      if(!event.isPrimary||event.button!==0)return;
      pending.current={target:event.currentTarget,id:event.pointerId,x:event.clientX,y:event.clientY,start:Date.now()};
    },
    onPointerMove(event:PointerEvent<HTMLElement>){
      const press=pending.current;
      if(press?.id===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>moveLimit)pending.current=null;
    },
    onPointerLeave(){pending.current=null;},
    onPointerCancel(){pending.current=null;},
    onPointerUp(event:PointerEvent<HTMLElement>){
      const press=pending.current;pending.current=null;
      if(press?.id!==event.pointerId||press.target!==event.currentTarget||Date.now()-press.start<holdTime||
        Math.hypot(event.clientX-press.x,event.clientY-press.y)>moveLimit)return;
      swallowed.current={target:press.target,until:Date.now()+400};
      open(event.currentTarget);
    },
    onClickCapture(event:MouseEvent<HTMLElement>){
      const click=swallowed.current;swallowed.current=null;
      if(click?.target===event.currentTarget&&Date.now()<=click.until&&event.detail!==0){event.preventDefault();event.stopPropagation();}
    },
    onKeyDown(event:KeyboardEvent<HTMLElement>){
      if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
      event.preventDefault();
      open(event.currentTarget);
    },
    onContextMenu(event:MouseEvent<HTMLElement>){
      event.preventDefault();
      const type=(event.nativeEvent as globalThis.PointerEvent).pointerType;
      // Suppress the platform touch callout; the stationary pointerup opens the action sheet.
      if(type==="touch"||pending.current?.target===event.currentTarget)return;
      open(event.currentTarget);
    },
  };
 };
}
