"use client";

import {useRef,useState,type CSSProperties,type MouseEvent,type ReactNode} from 'react';
import {ChevronRight} from 'lucide-react';
import {useSwipeCard} from './use-swipe-card';
import './swipe-card-motion.css';

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

function PreviewRow({title,children,onSkip,entering}:{
 title:string;children:ReactNode;onSkip:(button:HTMLButtonElement|null)=>void;entering:boolean;
}){
 const button=useRef<HTMLButtonElement>(null);
 const swipe=useSwipeCard<HTMLDivElement>(()=>onSkip(button.current),{allowLink:true});
 return <div {...swipe.shellProps} onClick={openTask}
  className={`swipe-motion-shell home-preview-row ${swipe.phase==='exit'?'swipe-motion-collapse':''} ${entering?'home-preview-enter':''}`}>
  <div className="swipe-motion-clip">
   {swipe.moving&&<div className="swipe-motion-rail" aria-hidden="true"><ChevronRight size={20}/></div>}
   <div className="swipe-motion-front home-preview-front" data-motion={swipe.phase}
    style={{'--swipe-motion-x':swipe.offset+'px'} as CSSProperties}>
    {children}
    <button ref={button} type="button" className="icon-button home-preview-next" aria-label={`דילוג בתצוגה: ${title}`}
     title="הצגת המשימה הבאה" onClick={swipe.commit}><ChevronRight size={17} aria-hidden="true"/></button>
   </div>
  </div>
 </div>;
}

export default function HomeTaskPreview<T extends {href:string;title:string}>({tasks,limit,renderTask}:{tasks:T[];limit:number;renderTask:(task:T)=>ReactNode}){
 const [{skipped,beforeSkip},setQueue]=useState(()=>({skipped:new Set<string>(),beforeSkip:new Set<string>()}));
 const focusHeading=useRef<HTMLDivElement>(null);
 const visible=tasks.filter(task=>!skipped.has(task.href)).slice(0,limit);
 function skip(task:T,index:number,button:HTMLButtonElement|null){
  // Move focus only when the accessible button, not the swipe, initiated the change.
  if(button&&document.activeElement===button){
   const neighbors=focusHeading.current?.querySelectorAll<HTMLButtonElement>('.home-preview-next');
   (neighbors?.[index+1]||neighbors?.[index-1]||focusHeading.current)?.focus({preventScroll:true});
  }
  setQueue(previous=>({beforeSkip:new Set(visible.map(item=>item.href)),skipped:new Set([...previous.skipped,task.href])}));
 }
 return <div className="home-preview-list" ref={focusHeading} tabIndex={-1} aria-label="משימות קרובות">
  {visible.map((task,index)=><PreviewRow key={task.href} title={task.title} entering={skipped.size>0&&!beforeSkip.has(task.href)}
   onSkip={button=>skip(task,index,button)}>{renderTask(task)}</PreviewRow>)}
  {!visible.length&&<p className="empty" role="status">אין עוד משימות בתצוגה המקדימה</p>}
 </div>;
}
