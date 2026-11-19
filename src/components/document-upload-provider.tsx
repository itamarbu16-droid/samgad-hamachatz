'use client';
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
function stageText(job:PendingDocument){
 if(job.phase==='queued')return 'ממתין בתור';
 if(job.phase==='saved')return 'השמירה אושרה; מרענן את הרשימה';
 if(job.phase==='failed')return 'ההעלאה לא הושלמה';
 if(job.phase==='committing')return 'ממתין לאישור שמירת המסמך';
 if(job.stage==='checking')return 'בודק התחברות והרשאות…';
 if(job.stage==='preparing')return 'מכין את הקבצים להעלאה…';
 return 'מעלה ברקע בתוך האפליקציה…';
}
export function DocumentUploadJob({job,store,showFiles=false}:{job:PendingDocument;store:BackgroundDocumentUpload;showFiles?:boolean}){
 return <>
  <strong>{job.draft.title}</strong><small>{job.destination}</small>
  {showFiles&&job.files.map((file,index)=><div key={index}>
    <p>{file.name} · {Math.floor(file.bytes/file.size*100)}%</p>
    <progress aria-label={`העלאת ${file.name}`} value={file.bytes} max={file.size}/>
  </div>)}
  <p role="status">{stageText(job)}</p>
  {job.phase==='failed'&&<><p role="alert">{job.error}</p><button className="button secondary" aria-label={`ניסיון נוסף: ${job.draft.title} · ${job.destination}`} onClick={()=>store.retry(job.id)}>ניסיון נוסף</button></>}
  {['queued','failed','uploading'].includes(job.phase)&&<button className="button secondary" aria-label={`הסרה מתור ההעלאות: ${job.draft.title} · ${job.destination}`} onClick={()=>store.remove(job.id)}>{job.phase==='uploading'?'עצירת העלאה':'הסרה מהתור'}</button>}
 </>;
}
export function DocumentUploadStatus(){
 const {store,pendingDocuments}=useDocumentUpload();
 if(!pendingDocuments.length)return null;
 const waiting=pendingDocuments.filter(job=>job.phase==='queued').length;
 return <aside className="panel document-upload document-filename" aria-label="תור העלאות מסמכים">
  <strong>תור העלאות מסמכים{waiting===1?' · אחד ממתין':waiting>1?` · ${waiting} ממתינים`:''}</strong>
  <small>אפשר לעבור בין מסכי האפליקציה. סגירה או רענון עלולים להפסיק את ההעלאה; הקבצים אינם נשמרים במכשיר להמשך אוטומטי.</small>
  <ul>{pendingDocuments.map(job=><li key={job.id}><DocumentUploadJob job={job} store={store}/></li>)}</ul>
 </aside>;
}
