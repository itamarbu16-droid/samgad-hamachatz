import {DOCUMENT_REQUEST_TIMEOUT_MS,prepareDocumentFiles,validateDocumentFiles,type DocumentUploadCache} from './document-uploads';
export type UploadIdentity={userId:string;workspaceOwnerId:string;organizationId:string};
type UploadContext=UploadIdentity&{organizationId:string;sessionMarker:string};
export type DocumentDraft={title:string;body:string;folderId:string;documentDate:FormDataEntryValue|null};
export type UploadStage='checking'|'preparing'|'transferring'|'committing';
export type PendingDocument={id:string;draft:DocumentDraft;destination:string;files:{name:string;size:number;bytes:number}[];phase:'queued'|'uploading'|'committing'|'failed'|'saved';stage?:UploadStage;error?:string;entryId?:string};
export const MAX_PENDING_DOCUMENTS=5;
export const MAX_PENDING_DOCUMENT_BYTES=100*1024*1024;
class ContextChanged extends Error {}
class JobRemoved extends Error {}
class UploadFailure extends Error {constructor(message:string,readonly status:number){super(message);}}
type Job={view:PendingDocument;files:File[];cache:DocumentUploadCache;attachments:{uploadId:string}[]|null};
const stageNames:Record<UploadStage,string>={checking:'בדיקת ההתחברות',preparing:'הכנת הקובץ להעלאה',transferring:'העברת הקובץ',committing:'אישור שמירת המסמך'};
function stageError(stage:UploadStage){
 return `לא הושלם שלב ${stageNames[stage]}. לא התקבל אישור שמירת המסמך. אפשר לנסות שוב מהתור.`;
}
// One mounted workspace owns the entire bounded, memory-only queue.
// A failed job keeps its stable IDs and bytes, but does not hold the worker.
export class BackgroundDocumentUpload {
 private identity:UploadIdentity|null=null;
 private context:UploadContext|null=null;
 private jobs=new Map<string,Job>();
 private order:string[]=[];
 private queue:string[]=[];
 private views:readonly PendingDocument[]=[];
 private controller:AbortController|null=null;
 private running:string|null=null;
 private drainingBytes=0;
 private listeners=new Set<()=>void>();
 private epoch=0;
 constructor(private request:typeof fetch=(input,init)=>globalThis.fetch(input,init),private saved:()=>void=()=>{},private stopped:()=>void=()=>{}){}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 snapshot=()=>this.views[0]??null;
 snapshots=()=>this.views;
 private emit(){this.views=this.order.flatMap(id=>{const job=this.jobs.get(id);return job?[job.view]:[];});for(const listener of this.listeners)listener();}
 setIdentity(identity:UploadIdentity|null){
  // Old offline workspace snapshots lack the expected org: do not upload from them.
  if(identity&&(typeof identity.organizationId!=='string'||!identity.organizationId.trim()))identity=null;
  if(JSON.stringify(identity)!==JSON.stringify(this.identity)){this.clear();this.identity=identity;}
 }
 clear=()=>{
  this.epoch++;this.controller?.abort();
  const activeJob=this.running?this.jobs.get(this.running):null;
  if(activeJob)this.drainingBytes=activeJob.files.reduce((total,file)=>total+file.size,0);
  for(const job of this.jobs.values()){job.files=[];job.cache.clear();job.attachments=null;}
  this.jobs.clear();this.order=[];this.queue=[];this.context=null;this.emit();
  // Keep the worker occupied until any aborted in-flight requests settle.
 };
 start(draft:DocumentDraft,files:File[],destination:string){
  if(!this.identity)throw Error('יש להתחבר מחדש לפני העלאה');
  validateDocumentFiles(files);
  if(!draft.title.trim()||(!draft.body.trim()&&!files.length))throw Error('יש להוסיף כותרת וטקסט או קובץ');
  const outstanding=[...this.jobs.values()].filter(job=>job.view.phase!=='saved');
  if(outstanding.length+(this.running&&!this.jobs.has(this.running)?1:0)>=MAX_PENDING_DOCUMENTS)throw Error('התור מלא: אפשר להמתין עם עד 5 מסמכים. יש להשלים או להסיר מסמך מהתור');
  const retained=outstanding.reduce((total,job)=>total+job.files.reduce((n,file)=>n+file.size,0),0);
  if(this.drainingBytes+retained+files.reduce((n,file)=>n+file.size,0)>MAX_PENDING_DOCUMENT_BYTES)throw Error('התור מוגבל ל־100 מ״ב קבצים יחד. יש להמתין או להסיר מסמך מהתור');
  // Completed jobs contain no bytes. Bound their metadata if a folder was left
  // before its reload acknowledged them; the server remains the source of truth.
  for(const [id,job] of this.jobs)if(job.view.phase==='saved')this.drop(id);
  const id=crypto.randomUUID();
  this.jobs.set(id,{view:{id,draft:{...draft},destination,files:files.map(f=>({name:f.name,size:f.size,bytes:0})),phase:'queued'},files:[...files],cache:new Map(),attachments:null});
  this.order.push(id);this.queue.push(id);this.emit();this.pump();return id;
 }
 retry=(id?:string)=>{
  const job=id?this.jobs.get(id):[...this.jobs.values()].find(job=>job.view.phase==='failed');
  if(!job||job.view.phase!=='failed')return;
  job.view={...job.view,phase:'queued',error:undefined};this.queue.push(job.view.id);this.emit();this.pump();
 };
 private drop(id:string){
  const job=this.jobs.get(id);if(job){job.files=[];job.cache.clear();job.attachments=null;}
  this.jobs.delete(id);this.order=this.order.filter(key=>key!==id);this.queue=this.queue.filter(key=>key!==id);
 }
 remove=(id:string)=>{
  // Once finalization starts, cancellation cannot promise the server did not save.
  if(this.jobs.get(id)?.view.phase==='committing')return;
  if(this.running===id){this.drainingBytes=this.jobs.get(id)?.files.reduce((total,file)=>total+file.size,0)??this.drainingBytes;this.controller?.abort();}
  this.drop(id);this.emit();this.pump();
 };
 acknowledge=(entryId:string)=>{for(const [id,job] of this.jobs)if(job.view.phase==='saved'&&job.view.entryId===entryId)this.drop(id);this.emit();};
 private pump(){
  if(this.running||!this.identity)return;
  while(this.queue.length){const id=this.queue.shift()!;const job=this.jobs.get(id);if(job?.view.phase==='queued'){void this.run(job);return;}}
 }
 private async run(job:Job){
  const identity=this.identity;if(!identity||this.running)return;
  const id=job.view.id;this.running=id;const epoch=this.epoch;const controller=new AbortController();this.controller=controller;
  const active=()=>{if(epoch!==this.epoch||controller.signal.aborted||this.jobs.get(id)!==job)throw new JobRemoved();};
  const update=(change:Partial<PendingDocument>)=>{active();job.view={...job.view,...change};this.emit();};
  const json=async(url:string,body?:object)=>{
   active();
   const requestController=new AbortController();
   const cancel=()=>requestController.abort();
   controller.signal.addEventListener('abort',cancel,{once:true});
   const timeout=setTimeout(cancel,DOCUMENT_REQUEST_TIMEOUT_MS);
   try {
    const response=await this.request(url,{method:body?'POST':'GET',cache:'no-store',signal:requestController.signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(body&&this.context?{'x-document-user':this.context.userId,'x-document-organization':this.context.organizationId,'x-document-owner':this.context.workspaceOwnerId,'x-document-session':this.context.sessionMarker}:{})},...(body?{body:JSON.stringify(body)}:{})});
    active();if([401,403].includes(response.status))throw new ContextChanged();
    const value=await response.json();active();
    if(value.code==='DOCUMENT_UPLOAD_CONTEXT_CHANGED')throw new ContextChanged();
    if(!response.ok)throw new UploadFailure(value.error||'לא התקבל אישור שמירה',response.status);return value;
   } finally {clearTimeout(timeout);controller.signal.removeEventListener('abort',cancel);}
  };
  try{
   update({phase:'uploading',stage:'checking',error:undefined});
   const context=await json('/api/documents/upload-context') as UploadContext;active();
   if(!context||typeof context.userId!=='string'||!context.userId||typeof context.organizationId!=='string'||!context.organizationId||typeof context.sessionMarker!=='string'||!context.sessionMarker||typeof context.workspaceOwnerId!=='string')throw Error('לא התקבלה תשובת בדיקת התחברות תקינה');
   if(context.organizationId!==identity.organizationId||context.userId!==identity.userId||context.workspaceOwnerId!==identity.workspaceOwnerId||(this.context&&(['userId','organizationId','workspaceOwnerId','sessionMarker'] as const).some(key=>context[key]!==this.context![key])))throw new ContextChanged();
   this.context=context;
   if(!job.attachments){
    update({stage:'preparing'});
    const prepared=await prepareDocumentFiles(job.files,job.cache,()=>{}, {forceChunks:true,request:(url,body)=>{
     update({stage:url.endsWith('/chunks')?'transferring':'preparing'});return json(url,body);
    },fileProgress:(index,bytes)=>{update({files:job.view.files.map((f,i)=>i===index?{...f,bytes}:f)});}});
    active();job.attachments=prepared as {uploadId:string}[];
   }
   update({phase:'committing',stage:'committing'});
   const value=await json('/api/documents',{...job.view.draft,attachments:job.attachments,clientRequestId:id});
   if(!value.entry?.id)throw Error('לא התקבל אישור שמירה');
   job.files=[];job.cache.clear();job.attachments=null;
   update({phase:'saved',entryId:value.entry.id});this.saved();
  }catch(error){
   if(epoch!==this.epoch||error instanceof JobRemoved||!this.jobs.has(id))return;
   if(error instanceof ContextChanged){this.clear();this.stopped();return;}
   if(error instanceof UploadFailure&&error.status===404)job.attachments=null;
   update({phase:'failed',error:stageError(job.view.stage??'checking')});
  }finally{
   if(this.running===id){this.running=null;this.controller=null;this.drainingBytes=0;this.pump();}
  }
 }
}
