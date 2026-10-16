import {and,eq,gt,lt,isNull,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb,type Database} from './db';
import * as s from './schema';
import {AppError,assertWrite,type Principal} from './policy';
import {MAX_DOCUMENT_BYTES,DOCUMENT_CHUNK_BYTES,documentExtensions} from '@/lib/document-folders';
export const documentFilename=z.string().min(1).max(200).refine(name=>[...name].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127&&c!=='/'&&c!=='\\'),'שם הקובץ אינו תקין');
export function documentContentType(filename:string){
 const extension=filename.split('.').at(-1)?.toLowerCase() as keyof typeof documentExtensions;
 const type=documentExtensions[extension];if(!type)throw new AppError(422,'סוג הקובץ אינו נתמך');return type;
}
const owned=(p:Principal,id:string)=>and(eq(s.documentUploads.id,id),eq(s.documentUploads.organizationId,p.organizationId),eq(s.documentUploads.creatorId,p.userId));
export async function beginDocumentUpload(p:Principal,input:unknown){
 assertWrite(p);
 const data=z.object({id:z.string().uuid(),filename:documentFilename,byteSize:z.number().int().positive().max(MAX_DOCUMENT_BYTES)}).strict().parse(input);
 documentContentType(data.filename);const db=await getDb();
 return db.transaction(async tx=>{
  await tx.delete(s.documentUploads).where(lt(s.documentUploads.expiresAt,new Date()));
  const [existing]=await tx.select().from(s.documentUploads).where(eq(s.documentUploads.id,data.id));
  if(existing){
   if(existing.creatorId!==p.userId||existing.organizationId!==p.organizationId)throw new AppError(404,'ההעלאה אינה זמינה');
   if(existing.filename!==data.filename||existing.byteSize!==data.byteSize)throw new AppError(409,'מזהה ההעלאה כבר שימש לקובץ אחר');
  }else{
   // Serialize quota reservations per account without relying on session memory.
   await tx.update(s.user).set({updatedAt:sql`${s.user.updatedAt}`}).where(eq(s.user.id,p.userId));
   const pending=await tx.select({size:s.documentUploads.byteSize}).from(s.documentUploads).where(and(eq(s.documentUploads.organizationId,p.organizationId),eq(s.documentUploads.creatorId,p.userId)));
   if(pending.length>=10||pending.reduce((n,f)=>n+f.size,0)+data.byteSize>250*1024*1024)throw new AppError(429,'יש יותר מדי העלאות פעילות. נסה שוב מאוחר יותר');
   await tx.insert(s.documentUploads).values({...data,organizationId:p.organizationId,creatorId:p.userId,expiresAt:new Date(Date.now()+24*3600000)});
  }
  const chunks=await tx.select({index:s.documentUploadChunks.chunkIndex}).from(s.documentUploadChunks).where(eq(s.documentUploadChunks.uploadId,data.id));
  return {id:data.id,received:chunks.map(c=>c.index),chunkBytes:DOCUMENT_CHUNK_BYTES};
 });
}
export async function putDocumentChunk(p:Principal,input:unknown){
 assertWrite(p);
 const data=z.object({uploadId:z.string().uuid(),index:z.number().int().min(0).max(24),contentBase64:z.string().min(4).max(Math.ceil(DOCUMENT_CHUNK_BYTES/3)*4).regex(/^[A-Za-z0-9+/]*={0,2}$/)}).strict().parse(input);
 const bytes=Buffer.from(data.contentBase64,'base64');
 if(bytes.toString('base64')!==data.contentBase64)throw new AppError(422,'חלק הקובץ אינו תקין');
 const db=await getDb();return db.transaction(async tx=>{
  const [upload]=await tx.update(s.documentUploads).set({touchedAt:new Date()}).where(and(owned(p,data.uploadId),isNull(s.documentUploads.consumedBy),gt(s.documentUploads.expiresAt,new Date()))).returning();
  if(!upload)throw new AppError(404,'ההעלאה פגה או אינה זמינה');
  const expected=Math.min(DOCUMENT_CHUNK_BYTES,upload.byteSize-data.index*DOCUMENT_CHUNK_BYTES);
  if(expected<=0||bytes.length!==expected)throw new AppError(422,'גודל חלק הקובץ אינו תואם');
  const id=data.uploadId+':'+data.index;
  const [previous]=await tx.select().from(s.documentUploadChunks).where(eq(s.documentUploadChunks.id,id));
  if(previous&&previous.contentBase64!==data.contentBase64)throw new AppError(409,'חלק הקובץ כבר נשמר עם תוכן שונה');
  if(!previous)await tx.insert(s.documentUploadChunks).values({id,uploadId:data.uploadId,chunkIndex:data.index,contentBase64:data.contentBase64});
  return {received:data.index};
 });
}
type UploadDb=Pick<Database,'select'|'update'|'insert'|'delete'>;
export async function resolveDocumentUpload(tx:UploadDb,p:Principal,id:string,entryId:string){
 const [upload]=await tx.update(s.documentUploads).set({consumedBy:entryId}).where(and(owned(p,id),isNull(s.documentUploads.consumedBy),gt(s.documentUploads.expiresAt,new Date()))).returning();
 if(!upload)throw new AppError(404,'הקובץ שהועלה אינו זמין. יש לבחור אותו מחדש');
 const chunks=await tx.select().from(s.documentUploadChunks).where(eq(s.documentUploadChunks.uploadId,id)).orderBy(s.documentUploadChunks.chunkIndex);
 const count=Math.ceil(upload.byteSize/DOCUMENT_CHUNK_BYTES);
 if(chunks.length!==count||chunks.some((chunk,i)=>chunk.chunkIndex!==i))throw new AppError(422,'העלאת הקובץ טרם הסתיימה');
 const bytes=Buffer.concat(chunks.map(c=>Buffer.from(c.contentBase64,'base64')));
 if(bytes.length!==upload.byteSize)throw new AppError(422,'הקובץ שהועלה אינו שלם');
 return {filename:upload.filename,byteSize:bytes.length,contentType:documentContentType(upload.filename),contentBase64:bytes.toString('base64')};
}
