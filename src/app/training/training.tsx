'use client';
import {useEffect,useState} from 'react';
import LoginScreen from '@/components/login-screen';
import Workspace from '@/components/workspace';
import fixtures from './fixtures.json';
// This recording-only entry uses the original workspace/components and styles.
// All API calls are resolved locally from synthetic fixtures; none reach the API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string,any>;
export default function Training(){
 const [ready,setReady]=useState(false),[entered,setEntered]=useState(false);
 const role=typeof window!=='undefined'&&new URLSearchParams(location.search).get('role')==='manager'?'manager':'deputy';
 useEffect(()=>{
  const role=new URLSearchParams(location.search).get('role')==='manager'?'manager':'deputy';
  const state:Row=structuredClone(fixtures[role]),original=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),path=url.pathname;
   if(!path.startsWith('/api/'))return original(input,init);
   const method=init?.method||'GET',body=init?.body?JSON.parse(String(init.body)):{};
   const respond=(data:unknown,status=200)=>Response.json(data,{status});
   if(method==='GET'){
    if(path==='/api/deadline-requests')return respond(state.requests||[]);
    if(path==='/api/workspace')return respond(state.workspace);
    if(path==='/api/rhythm')return respond(state.rhythm);
    if(path==='/api/documents')return respond(state.documents);
    if(path==='/api/access')return respond(state.access);
    if(path==='/api/calendar')return respond({configured:false,connected:false});
    if(path.startsWith('/api/documents/'))return respond({entry:state.details.find((e:Row)=>e.id===path.split('/').pop())});
   }
   if(path==='/api/deadline-requests'&&method==='POST'){const task=state.workspace.tasks.find((t:Row)=>t.id===body.id);const request={id:crypto.randomUUID(),title:task?.title||'משימת הדרכה',requesterName:'סמ״פ א׳',originalDate:task?.dueDate,requestedDate:body.date,reason:body.reason,status:'pending'};state.requests=[request];return respond(request);}
   if(path==='/api/task-actions'){
    const key=body.kind+':'+body.id,pins:string[]=state.workspace.pinnedTaskKeys||[];
    if(body.action==='pin'){state.workspace.pinnedTaskKeys=body.pinned?[...new Set([...pins,key])]:pins.filter(p=>p!==key);state.rhythm.pinnedTaskKeys=state.workspace.pinnedTaskKeys;return respond({});}
    const task=state.workspace.tasks.find((t:Row)=>t.id===body.id);
    if(task){if(body.action==='extend')task.dueDate=body.date;if(body.action==='delete')task.status='cancelled';task.version++;return respond({});}
   }
   if(method==='PATCH'&&path.startsWith('/api/tasks/')){
    const task=state.workspace.tasks.find((t:Row)=>t.id===path.split('/').pop());
    if(task){Object.assign(task,body,{version:task.version+1});return respond({task});}
   }
   if(method==='PATCH'&&path.startsWith('/api/rhythm/occurrences/')){
    const row=state.rhythm.occurrences.find((o:Row)=>o.id===path.split('/').pop());
    if(row){const uid=body.userId||state.workspace.user.id;row.done=body.done;row.reports[uid]=new Date().toISOString();if(role==='manager')row.completions[uid]=new Date().toISOString();row.version++;return respond({occurrence:row});}
   }
   if(path==='/api/documents'&&method==='POST'){
    const entry={...body,id:crypto.randomUUID(),creatorId:state.workspace.user.id,preview:body.body||'',attachments:[],version:1,updatedAt:new Date().toISOString()};state.documents.entries.unshift(entry);state.details.unshift(entry);return respond({entry});
   }
   // Deliberately fail closed instead of accidentally writing to real data.
   return respond({error:'פעולה זו אינה חלק מתצוגת ההדרכה'},422);
  };
  setReady(true);
  return()=>{window.fetch=original;};
 },[]);
 return ready?(entered?<Workspace recording/>:<LoginScreen deputies={role==='deputy'} recordingEnter={()=>setEntered(true)}/>):<p>מכינים תצוגת הדרכה…</p>;
}
