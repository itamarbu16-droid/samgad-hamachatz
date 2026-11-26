import {DOCUMENT_CHUNK_BYTES,INLINE_DOCUMENT_BYTES,MAX_DOCUMENT_BYTES,MAX_DOCUMENT_TOTAL_BYTES} from './document-folders';
export const DOCUMENT_REQUEST_TIMEOUT_MS = 90_000;
export function documentUploadError(error:unknown):string {
 const name=error instanceof Error?error.name:'';
 const message=error instanceof Error?error.message:'';
 if(name==='AbortError'||name==='TimeoutError'||name==='TypeError'||/fetch is aborted|load failed|failed to fetch|networkerror/i.test(message))
  return 'החיבור נקטע או שההעלאה ארכה יותר מדי. לא התקבל אישור שמירה. השאר את החלון פתוח ונסה לשמור שוב';
 return message||'המסמך לא נשמר';
}
type UploadSession={id:string;filename:string;size:number;modified:number};
export type DocumentUploadCache=Map<File,UploadSession>;
export function encodeDocumentFile(file:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('לא ניתן לקרוא את הקובץ'));reader.readAsDataURL(file);});
}
export type UploadOptions={request?:(url:string,body:object)=>Promise<{received?:number[]}>; forceChunks?:boolean; fileProgress?:(index:number,bytes:number,total:number)=>void};
async function post(url:string,body:object){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(DOCUMENT_REQUEST_TIMEOUT_MS)});
 let result;try{result=await response.json();}catch{throw Error('ההעלאה נקטעה. אפשר לנסות לשמור שוב');}
 if(!response.ok)throw Error(result.error||'הקובץ לא הועלה');return result;
}
export function validateDocumentFiles(files:Pick<File,'size'>[]){
 if(files.length>5)throw Error('ניתן להוסיף עד 5 קבצים בכל שמירה');
 if(files.some(f=>!f.size||f.size>MAX_DOCUMENT_BYTES))throw Error('כל קובץ צריך להיות בגודל של עד 25 מ״ב');
 if(files.reduce((n,f)=>n+f.size,0)>MAX_DOCUMENT_TOTAL_BYTES)throw Error('אפשר להעלות עד 100 מ״ב בכל שמירה');
}
export async function prepareDocumentFiles(files:File[],cache:DocumentUploadCache,progress:(message:string)=>void,options:UploadOptions={}){
 validateDocumentFiles(files);
 const total=files.reduce((n,f)=>n+f.size,0);
 const send=options.request??post;
 if(!options.forceChunks&&total<=INLINE_DOCUMENT_BYTES)return Promise.all(files.map(async file=>({filename:file.name,contentBase64:await encodeDocumentFile(file)})));
 if(!navigator.onLine)throw Error('להעלאת קבצים גדולים נדרש חיבור לאינטרנט');
 const attachments=[];let transferred=0;
 for(let n=0;n<files.length;n++){
  const file=files[n];let session=cache.get(file);
  if(!session){session={id:crypto.randomUUID(),filename:file.name,size:file.size,modified:file.lastModified};cache.set(file,session);}
  progress(`מעלה קובץ ${n+1} מתוך ${files.length}…`);
  const started=await send('/api/documents/uploads',{id:session.id,filename:file.name,byteSize:file.size});
  const received=new Set<number>(started.received??[]);
  const missing:number[]=[];
  let fileBytes=0;
  const report=()=>{progress(`מעלה קובץ ${n+1} מתוך ${files.length} · ${Math.round(transferred/total*100)}%`);options.fileProgress?.(n,fileBytes,file.size);};
  for(let index=0;index<Math.ceil(file.size/DOCUMENT_CHUNK_BYTES);index++){
   if(received.has(index)){const bytes=Math.min(DOCUMENT_CHUNK_BYTES,file.size-index*DOCUMENT_CHUNK_BYTES);transferred+=bytes;fileBytes+=bytes;}
   else missing.push(index);
  }
  report();
  // Two bounded requests overlap network latency. Keep the server's row lock:
  // it serializes writes, while the client never starts a new batch after failure.
  for(let start=0;start<missing.length;start+=2){
   const results=await Promise.allSettled(missing.slice(start,start+2).map(async index=>{
    const part=file.slice(index*DOCUMENT_CHUNK_BYTES,(index+1)*DOCUMENT_CHUNK_BYTES);
    await send('/api/documents/uploads/chunks',{uploadId:session.id,index,contentBase64:await encodeDocumentFile(part)});
    transferred+=part.size;fileBytes+=part.size;report();
   }));
   // Wait for every in-flight write before rejecting, so a manual retry cannot
   // race a previous batch or lose an acknowledgement that arrived after failure.
   const failed=results.find(result=>result.status==='rejected');
   if(failed?.status==='rejected')throw failed.reason;
  }
  attachments.push({uploadId:session.id});
 }
 return attachments;
}

