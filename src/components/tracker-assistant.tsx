"use client";

import {useId,useState} from 'react';
import {MAX_TRACKER_PROMPT,TRACKER_PROMPT_EXAMPLE,parseTrackerPrompt,type TrackerDraft} from '@/lib/tracker-assistant';
import {Modal} from './workspace-primitives';

export default function TrackerAssistant({folder,onPreview,close}:{folder:string;onPreview:(draft:TrackerDraft)=>void;close:()=>void}){
 const [prompt,setPrompt]=useState('');
 const [error,setError]=useState('');
 const description=useId(),errorId=useId();
 return <Modal title="עוזר ליצירת טבלה" close={close}>
  <form onSubmit={event=>{
   event.preventDefault();
   const result=parseTrackerPrompt(prompt);
   if(result.error!==undefined){setError(result.error);return;}
   onPreview(result.draft);
  }}>
   <p>תיקיית יעד: <strong>{folder}</strong></p>
   <label>איך הטבלה צריכה להיראות?
    <textarea name="trackerPrompt" rows={5} maxLength={MAX_TRACKER_PROMPT} value={prompt}
     aria-describedby={error?description+' '+errorId:description} aria-invalid={Boolean(error)}
     onChange={event=>{setPrompt(event.target.value);setError('');}}/>
   </label>
   <p id={description}>כתבו שם, עמודות ומספר שורות. התיאור נשאר במכשיר; רק הטבלה תישמר כשתאשרו.</p>
   <details><summary>דוגמאות</summary>
    <p>{TRACKER_PROMPT_EXAMPLE}</p>
    <p>שם: מלאי חומרים; תבנית: מלאי; שורות: 10</p>
    <p>להזנת תוכן כתבו בשורה נפרדת: שורה: פריט לדוגמה | 2 | יחידות</p>
   </details>
   {error&&<p role="alert" id={errorId}>{error}</p>}
   <button className="button primary" type="submit">הכנת תצוגה מקדימה</button>
  </form>
 </Modal>;
}
