'use client';
import {CircleAlert,Check,X} from 'lucide-react';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {BackgroundDocumentUpload,type PendingDocument} from '@/lib/background-document-upload';
const UploadContext=createContext<BackgroundDocumentUpload|null>(null);
export function DocumentUploadProvider({children}:{children:ReactNode}){
 const [stopped,setStopped]=useState(false);
 const [store]=useState(()=>new BackgroundDocumentUpload((input,init)=>globalThis.fetch(input,init),()=>window.dispatchEvent(new Event('samgad:saved')),()=>setStopped(true)));
 useEffect(()=>{
  const leave=(event:BeforeUnloadEvent)=>{if(store.snapshots().some(job=>job.phase!=='saved')){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',leave);window.addEventListener('pagehide',store.clear);
  return()=>{window.removeEventListener('beforeunload',leave);window.removeEventListener('pagehide',store.clear);store.clear();};
 },[store]);
 return <UploadContext.Provider value={store}>{stopped&&<p role="alert">ההעלאה נעצרה כי ההתחברות או ההרשאות השתנו. לאחר התחברות יש לבחור את הקבצים מחדש.</p>}{children}</UploadContext.Provider>;
}
export function useDocumentUploadStore(){
 const store=useContext(UploadContext);
 if(!store)throw Error('DocumentUploadProvider is required');
 return store;
}
const emptyQueue:readonly PendingDocument[]=[];
const getEmptyQueue=()=>emptyQueue;
export function useDocumentUpload(){
 const store=useDocumentUploadStore();
 const pendingDocuments=useSyncExternalStore(store.subscribe,store.snapshots,getEmptyQueue);
 return {store,pendingDocuments};
}
function UploadRing({bytes,size,label}:{bytes:number;size:number;label:string}){
 const percent=size>0?Math.max(0,Math.min(100,Math.floor(bytes/size*100))):0;
 return <span className="upload-ring" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
  <svg viewBox="0 0 46 46" aria-hidden="true">
   <circle className="upload-ring-track" cx="23" cy="23" r="20"/>
   {percent>0&&<circle className="upload-ring-fill" cx="23" cy="23" r="20" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 23 23)"/>}
  </svg>
  <bdi dir="ltr">{percent}%</bdi>
 </span>;
}

export function DocumentUploadJob({job,store,showFiles=false}:{job:PendingDocument;store:BackgroundDocumentUpload;showFiles?:boolean}){
 const queued=job.phase==='queued', failed=job.phase==='failed', saved=job.phase==='saved';
 const status=queued?'בתור': saved?'נשמר':job.phase==='committing'?'שומר…':undefined;
 const actionLabel=job.phase==='uploading'?'עצירת העלאה':'הסרה מהתור';
 const canRemove=queued||failed||job.phase==='uploading';
 const multiple=showFiles&&job.files.length>1;
 const totals=job.files.reduce((sum,file)=>({bytes:sum.bytes+file.bytes,size:sum.size+file.size}),{bytes:0,size:0});
 const ringLabel=`העלאת ${showFiles&&job.files.length===1?job.files[0].name:job.draft.title}`;
 return <>
  <div className="upload-job-row">
   {failed?<span className="upload-job-symbol upload-job-failed"><CircleAlert size={23} aria-hidden="true"/></span>:
    saved?<span className="upload-job-symbol"><Check size={24} aria-hidden="true"/></span>:
    !multiple&&totals.size>0?<UploadRing {...totals} label={ringLabel}/>:null}
   <div className="upload-job-details">
    <strong dir="auto">{job.draft.title}</strong>
    {!showFiles&&<small>{job.destination}</small>}
    {status&&<small className="upload-job-state" role="status">{status}</small>}
   </div>
   {canRemove&&<button type="button" className="icon-button upload-job-remove" title={actionLabel} aria-label={`${actionLabel}: ${job.draft.title} · ${job.destination}`} onClick={()=>store.remove(job.id)}><X size={18} aria-hidden="true"/></button>}
  </div>
  {multiple&&!failed&&!saved&&<ul className="upload-job-files">{job.files.map((file,index)=><li key={index}><UploadRing {...file} label={`העלאת ${file.name}`}/><bdi>{file.name}</bdi></li>)}</ul>}
  {failed&&<div className="upload-job-error">
   <p role="alert">{job.error||'ההעלאה לא הושלמה'}</p>
   <button type="button" className="button secondary" aria-label={`ניסיון נוסף: ${job.draft.title} · ${job.destination}`} onClick={()=>store.retry(job.id)}>ניסיון נוסף</button>
  </div>}
 </>;
}
export function DocumentUploadStatus(){
 const {store,pendingDocuments}=useDocumentUpload();
 if(!pendingDocuments.length)return null;
 return <aside className="panel upload-queue" aria-label="תור העלאות מסמכים">
  <strong className="upload-queue-label">העלאות</strong>
  <ul className="upload-queue-list">{pendingDocuments.map(job=><li key={job.id}><DocumentUploadJob job={job} store={store}/></li>)}</ul>
 </aside>;
}
