import {DOCUMENT_CHUNK_BYTES,INLINE_DOCUMENT_BYTES,MAX_DOCUMENT_BYTES,MAX_DOCUMENT_TOTAL_BYTES} from './document-folders';
type UploadSession={id:string;filename:string;size:number;modified:number};
export type DocumentUploadCache=Map<File,UploadSession>;
export function encodeDocumentFile(file:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('לא ניתן לקרוא את הקובץ'));reader.readAsDataURL(file);});
}
async function post(url:string,body:object){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 let result;try{result=await response.json();}catch{throw Error('ההעלאה נקטעה. אפשר לנסות לשמור שוב');}
 if(!response.ok)throw Error(result.error||'הקובץ לא הועלה');return result;
}
export function validateDocumentFiles(files:Pick<File,'size'>[]){
 if(files.length>5)throw Error('ניתן להוסיף עד 5 קבצים בכל שמירה');
 if(files.some(f=>!f.size||f.size>MAX_DOCUMENT_BYTES))throw Error('כל קובץ צריך להיות בגודל של עד 25 מ״ב');
 if(files.reduce((n,f)=>n+f.size,0)>MAX_DOCUMENT_TOTAL_BYTES)throw Error('אפשר להעלות עד 100 מ״ב בכל שמירה');
}
export async function prepareDocumentFiles(files:File[],cache:DocumentUploadCache,progress:(message:string)=>void){
 validateDocumentFiles(files);
 const total=files.reduce((n,f)=>n+f.size,0);
 if(total<=INLINE_DOCUMENT_BYTES)return Promise.all(files.map(async file=>({filename:file.name,contentBase64:await encodeDocumentFile(file)})));
 if(!navigator.onLine)throw Error('להעלאת קבצים גדולים נדרש חיבור לאינטרנט');
 const attachments=[];let transferred=0;
 for(let n=0;n<files.length;n++){
  const file=files[n];let session=cache.get(file);
  if(!session){session={id:crypto.randomUUID(),filename:file.name,size:file.size,modified:file.lastModified};cache.set(file,session);}
  progress(`מעלה קובץ ${n+1} מתוך ${files.length}…`);
  const started=await post('/api/documents/uploads',{id:session.id,filename:file.name,byteSize:file.size});
  const received=new Set<number>(started.received);
  for(let index=0;index<Math.ceil(file.size/DOCUMENT_CHUNK_BYTES);index++){
   const part=file.slice(index*DOCUMENT_CHUNK_BYTES,(index+1)*DOCUMENT_CHUNK_BYTES);
   if(!received.has(index))await post('/api/documents/uploads/chunks',{uploadId:session.id,index,contentBase64:await encodeDocumentFile(part)});
   transferred+=part.size;progress(`מעלה קובץ ${n+1} מתוך ${files.length} · ${Math.round(transferred/total*100)}%`);
  }
  attachments.push({uploadId:session.id});
 }
 return attachments;
}

