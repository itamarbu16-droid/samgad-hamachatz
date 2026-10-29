import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {seedDemo} from '../src/server/seed';
import {getDb,closeDb} from '../src/server/db';
import {principalFor} from '../src/server/service';
import {beginDocumentUpload,putDocumentChunk} from '../src/server/document-uploads';
import {createDocument,getDocument,downloadDocument,updateDocument} from '../src/server/documents';
import {DOCUMENT_CHUNK_BYTES,MAX_DOCUMENT_BYTES} from '../src/lib/document-folders';
import {validateDocumentFiles} from '../src/lib/document-uploads';
import type {Principal} from '../src/server/policy';
import * as s from '../src/server/schema';
let owner:Principal,other:Principal;
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='large-documents-isolated-secret-1234567890123';process.env.DEMO_PASSWORD='large-documents-test-password';process.env.DEMO_EMAIL='demo@samgad.example';
 await seedDemo();const users=await (await getDb()).select().from(s.user);
 const p=(email:string)=>{const u=users.find(u=>u.email===email)!;return principalFor(u.id,u.name);};owner=await p('demo@samgad.example');other=await p('contributor@samgad.example');
},60000);
afterAll(closeDb);
const input=(uploadId:string)=>({clientRequestId:randomUUID(),title:'מסמך גדול לבדיקה',folderId:'orders',attachments:[{uploadId}]});
it('round-trips a file larger than the platform request limit using small resumable chunks',async()=>{
 const bytes=Buffer.alloc(5*1024*1024+137,37),id=randomUUID();
 await beginDocumentUpload(owner,{id,filename:'large.pdf',byteSize:bytes.length});
 for(let index=0;index<Math.ceil(bytes.length/DOCUMENT_CHUNK_BYTES);index++){
  const body={uploadId:id,index,contentBase64:bytes.subarray(index*DOCUMENT_CHUNK_BYTES,(index+1)*DOCUMENT_CHUNK_BYTES).toString('base64')};
  expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(1_410_000);
  await putDocumentChunk(owner,body);if(index===0)await putDocumentChunk(owner,body);
 }
 expect((await beginDocumentUpload(owner,{id,filename:'large.pdf',byteSize:bytes.length})).received).toHaveLength(6);
 const request=input(id),entry=await createDocument(owner,request);
 expect((await createDocument(owner,request)).id).toBe(entry.id);
 const detail=await getDocument(owner,entry.id);expect(detail.attachments[0].byteSize).toBe(bytes.length);
 expect((await downloadDocument(owner,detail.attachments[0].id)).bytes.equals(bytes)).toBe(true);
 expect(await (await getDb()).select().from(s.documentUploads).where(eq(s.documentUploads.id,id))).toHaveLength(0);
});
it('rejects incomplete files atomically and permits resuming after the failed save',async()=>{
 const id=randomUUID();await beginDocumentUpload(owner,{id,filename:'resume.txt',byteSize:9});
 const request=input(id);await expect(createDocument(owner,request)).rejects.toMatchObject({status:422});
 await putDocumentChunk(owner,{uploadId:id,index:0,contentBase64:Buffer.from('synthetic').toString('base64')});
 expect((await createDocument(owner,request)).id).toBeTruthy();
});
it('protects staged files from other accounts, tenants and non-writers',async()=>{
 const id=randomUUID();await beginDocumentUpload(owner,{id,filename:'private.txt',byteSize:9});
 const part={uploadId:id,index:0,contentBase64:Buffer.from('synthetic').toString('base64')};
 await expect(putDocumentChunk(other,part)).rejects.toMatchObject({status:404});
 await expect(putDocumentChunk({...owner,organizationId:'other-tenant'},part)).rejects.toMatchObject({status:404});
 await expect(beginDocumentUpload({...other,role:'viewer'},{id:randomUUID(),filename:'x.pdf',byteSize:9})).rejects.toMatchObject({status:403});
 await putDocumentChunk(owner,part);await expect(createDocument(other,input(id))).rejects.toMatchObject({status:404});
 await expect(createDocument({...owner,organizationId:'other-tenant'},input(id))).rejects.toThrow();
});
it('checks sizes, duplicate content, allowed extensions and expiration',async()=>{
 await expect(beginDocumentUpload(owner,{id:randomUUID(),filename:'too-large.pdf',byteSize:MAX_DOCUMENT_BYTES+1})).rejects.toThrow();
 await expect(beginDocumentUpload(owner,{id:randomUUID(),filename:'unsafe.html',byteSize:9})).rejects.toThrow();
 const id=randomUUID();await beginDocumentUpload(owner,{id,filename:'test.txt',byteSize:9});
 await expect(putDocumentChunk(owner,{uploadId:id,index:0,contentBase64:Buffer.from('short').toString('base64')})).rejects.toMatchObject({status:422});
 await putDocumentChunk(owner,{uploadId:id,index:0,contentBase64:Buffer.from('synthetic').toString('base64')});
 await expect(putDocumentChunk(owner,{uploadId:id,index:0,contentBase64:Buffer.from('different').toString('base64')})).rejects.toMatchObject({status:409});
 await (await getDb()).update(s.documentUploads).set({expiresAt:new Date(0)}).where(eq(s.documentUploads.id,id));
 await expect(createDocument(owner,input(id))).rejects.toMatchObject({status:404});
});
it('adds staged files during document editing while preserving existing attachments',async()=>{
 const entry=await createDocument(owner,{clientRequestId:randomUUID(),title:'מסמך לעריכה',folderId:'orders',body:'סיכום'});
 const id=randomUUID();await beginDocumentUpload(owner,{id,filename:'extra.txt',byteSize:9});
 await putDocumentChunk(owner,{uploadId:id,index:0,contentBase64:Buffer.from('synthetic').toString('base64')});
 await updateDocument(owner,entry.id,{title:'מסמך לעריכה',folderId:'orders',body:'סיכום',version:1,attachments:[{uploadId:id}]});
 expect((await getDocument(owner,entry.id)).attachments).toHaveLength(1);
});
it('validates per-file and total selection limits consistently on the client',()=>{
 expect(()=>validateDocumentFiles([{size:25*1024*1024}])).not.toThrow();
 expect(()=>validateDocumentFiles([{size:MAX_DOCUMENT_BYTES+1}])).toThrow('25');
 expect(()=>validateDocumentFiles(Array.from({length:5},()=>({size:MAX_DOCUMENT_BYTES})))).toThrow('100');
});
