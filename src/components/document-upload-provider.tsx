'use client';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {BackgroundDocumentUpload} from '@/lib/background-document-upload';
const UploadContext=createContext<BackgroundDocumentUpload|null>(null);
export function DocumentUploadProvider({children}:{children:ReactNode}){
 const [stopped,setStopped]=useState(false);
 const [store]=useState(()=>new BackgroundDocumentUpload(fetch,()=>window.dispatchEvent(new Event('samgad:saved')),()=>setStopped(true)));
 useEffect(()=>{
  const leave=(event:BeforeUnloadEvent)=>{if(store.snapshot()&&store.snapshot()?.phase!=='saved'){event.preventDefault();event.returnValue='';}};
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
export function useDocumentUpload(){
 const store=useDocumentUploadStore();
 const pending=useSyncExternalStore(store.subscribe,store.snapshot,()=>null);
 return {store,pending};
}
export function DocumentUploadStatus(){
 const {store,pending}=useDocumentUpload();
 if(!pending)return null;
 return <aside className="panel document-upload document-filename" aria-label="מצב העלאת מסמך">
  <strong>{pending.draft.title} · {pending.destination}</strong>
  <p role="status">{pending.phase==='saved'?'נשמר. מרענן את התיקייה…':pending.phase==='committing'?'הקבצים הועלו. ממתין לאישור שמירת המסמך…':pending.phase==='failed'?'ההעלאה לא הושלמה':'מעלה ברקע בתוך האפליקציה…'}</p>
  <small>אפשר לעבור בין מסכי האפליקציה. סגירה או רענון עלולים להפסיק את ההעלאה; הקבצים אינם נשמרים במכשיר להמשך אוטומטי.</small>
  {pending.phase==='failed'&&<><p role="alert">{pending.error}</p><button className="button secondary" onClick={store.retry}>ניסיון נוסף</button><button className="button secondary" onClick={store.clear}>הסר מההמתנה</button></>}
 </aside>;
}
