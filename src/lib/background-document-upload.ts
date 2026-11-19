import {DOCUMENT_REQUEST_TIMEOUT_MS,documentUploadError,prepareDocumentFiles,validateDocumentFiles,type DocumentUploadCache} from './document-uploads';
export type UploadIdentity={userId:string;workspaceOwnerId:string};
type UploadContext=UploadIdentity&{organizationId:string;sessionMarker:string};
export type DocumentDraft={title:string;body:string;folderId:string;documentDate:FormDataEntryValue|null};
export type PendingDocument={id:string;draft:DocumentDraft;destination:string;files:{name:string;size:number;bytes:number}[];phase:'uploading'|'committing'|'failed'|'saved';error?:string;entryId?:string};
class ContextChanged extends Error {}
class UploadFailure extends Error {constructor(message:string,readonly status:number){super(message);}}
// Owned by one mounted workspace, never persisted or placed in the offline queue.
export class BackgroundDocumentUpload {
 private identity:UploadIdentity|null=null;
 private context:UploadContext|null=null;
 private files:File[]=[];
 private cache:DocumentUploadCache=new Map();
 private controller:AbortController|null=null;
 private listeners=new Set<()=>void>();
 private pending:PendingDocument|null=null;
 private running=false;
 private epoch=0;
 private attachments:{uploadId:string}[]|null=null;
 constructor(private request:typeof fetch=fetch,private saved:()=>void=()=>{},private stopped:()=>void=()=>{}){}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 snapshot=()=>this.pending;
 private emit(){for(const listener of this.listeners)listener();}
 setIdentity(identity:UploadIdentity|null){
  if(JSON.stringify(identity)!==JSON.stringify(this.identity)){this.clear();this.identity=identity;}
 }
 clear=()=>{this.epoch++;this.controller?.abort();this.controller=null;this.pending=null;this.files=[];this.cache.clear();this.context=null;this.attachments=null;this.running=false;this.emit();};
 start(draft:DocumentDraft,files:File[],destination:string){
  if(!this.identity)throw Error('יש להתחבר מחדש לפני העלאה');
  if(this.pending?.phase==='saved')this.clear();
  if(this.pending)throw Error('יש לסיים או להסיר את ההעלאה הקודמת לפני העלאה נוספת');
  validateDocumentFiles(files);
  if(!draft.title.trim()||(!draft.body.trim()&&!files.length))throw Error('יש להוסיף כותרת וטקסט או קובץ');
  this.files=[...files];this.pending={id:crypto.randomUUID(),draft:{...draft},destination,files:files.map(f=>({name:f.name,size:f.size,bytes:0})),phase:'uploading'};
  this.emit();void this.run();
 }
 retry=()=>{if(this.pending?.phase==='failed'&&!this.running)void this.run();};
 acknowledge=(id:string)=>{if(this.pending?.phase==='saved'&&this.pending.entryId===id)this.clear();};
 private async run(){
  const job=this.pending,identity=this.identity;if(!job||!identity||this.running)return;
  this.running=true;const epoch=this.epoch;const controller=new AbortController();this.controller=controller;
  const active=()=>{if(epoch!==this.epoch||controller.signal.aborted)throw new ContextChanged();};
  const update=(change:Partial<PendingDocument>)=>{active();this.pending={...this.pending!,...change};this.emit();};
  const json=async(url:string,body?:object)=>{
   active();
   const requestController=new AbortController();
   const cancel=()=>requestController.abort();
   controller.signal.addEventListener('abort',cancel,{once:true});
   const timeout=setTimeout(cancel,DOCUMENT_REQUEST_TIMEOUT_MS);
   try {
   const response=await this.request(url,{method:body?'POST':'GET',cache:'no-store',signal:requestController.signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(body&&this.context?{'x-document-user':this.context.userId,'x-document-organization':this.context.organizationId,'x-document-owner':this.context.workspaceOwnerId,'x-document-session':this.context.sessionMarker}:{})},...(body?{body:JSON.stringify(body)}:{})});
   active();if([401,403].includes(response.status))throw new ContextChanged();
   const value=await response.json();
   if(value.code==='DOCUMENT_UPLOAD_CONTEXT_CHANGED')throw new ContextChanged();
   if(!response.ok)throw new UploadFailure(value.error||'לא התקבל אישור שמירה',response.status);return value;
   } finally {clearTimeout(timeout);controller.signal.removeEventListener('abort',cancel);}
  };
  try{
   update({phase:this.attachments?'committing':'uploading',error:undefined});
   const context=await json('/api/documents/upload-context') as UploadContext;
   if(!context||typeof context.userId!=='string'||!context.userId||typeof context.organizationId!=='string'||!context.organizationId||typeof context.sessionMarker!=='string'||!context.sessionMarker||typeof context.workspaceOwnerId!=='string')throw new ContextChanged();
   if(context.userId!==identity.userId||context.workspaceOwnerId!==identity.workspaceOwnerId||(this.context&&(['userId','organizationId','workspaceOwnerId','sessionMarker'] as const).some(key=>context[key]!==this.context![key])))throw new ContextChanged();
   this.context=context;
   if(!this.attachments){
    const prepared=await prepareDocumentFiles(this.files,this.cache,()=>{}, {forceChunks:true,request:json,fileProgress:(index,bytes)=>{
     const files=this.pending!.files.map((f,i)=>i===index?{...f,bytes}:f);update({files});
    }});
    active();this.attachments=prepared as {uploadId:string}[];
   }
   update({phase:'committing'});
   const value=await json('/api/documents',{...job.draft,attachments:this.attachments,clientRequestId:job.id});
   if(!value.entry?.id)throw Error('לא התקבל אישור שמירה');
   this.files=[];this.cache.clear();this.attachments=null;
   update({phase:'saved',entryId:value.entry.id});this.saved();
  }catch(error){
   if(epoch!==this.epoch)return;
   if(error instanceof ContextChanged){this.clear();this.stopped();return;}
   if(error instanceof UploadFailure&&error.status===404)this.attachments=null;
   update({phase:'failed',error:documentUploadError(error)});
  }finally{if(epoch===this.epoch){this.running=false;this.controller=null;}}
 }
}
