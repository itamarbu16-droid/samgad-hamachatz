// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {prepareDocumentFiles,documentUploadError,DOCUMENT_REQUEST_TIMEOUT_MS} from '../src/lib/document-uploads';
import {requestTimeoutMs} from '../src/lib/offline';
afterEach(()=>vi.unstubAllGlobals());
it('chunks 2.7 MiB JPEG and resumes acknowledged chunks after interruption',async()=>{
 const file=new File([new Uint8Array(Math.floor(2.7*1024*1024))],'synthetic.jpg',{type:'image/jpeg'});
 const cache=new Map();const received=new Set<number>();let fail=true;
 const fetcher=vi.fn(async (url:string,init:RequestInit)=>{
  const body=JSON.parse(String(init.body));expect(init.signal).toBeDefined();
  if(url.endsWith('/chunks')){
   if(body.index===1&&fail){fail=false;throw new TypeError('Load failed');}
   received.add(body.index);return Response.json({received:body.index});
  }
  return Response.json({id:body.id,received:[...received]});
 });vi.stubGlobal('fetch',fetcher);
 await expect(prepareDocumentFiles([file],cache,()=>{})).rejects.toThrow('Load failed');
 const firstId=cache.get(file).id;
 const result=await prepareDocumentFiles([file],cache,()=>{});
 expect(result).toEqual([{uploadId:firstId}]);
 const chunks=fetcher.mock.calls.filter(([url])=>url.endsWith('/chunks')).map(([,init])=>JSON.parse(String(init.body)).index);
 expect(chunks).toEqual([0,1,1,2]);
 expect(fetcher.mock.calls.filter(([url])=>!url.endsWith('/chunks')).map(([,init])=>JSON.parse(String(init.body)).id)).toEqual([firstId,firstId]);
});
it.each([new TypeError('Load failed'),new DOMException('Fetch is aborted','AbortError'),new DOMException('timeout','TimeoutError')])('localizes network failures without claiming failure to save',error=>{
 expect(documentUploadError(error)).toContain('לא התקבל אישור שמירה');expect(documentUploadError(error)).not.toContain(error.message);
});
it('preserves useful validation errors',()=>expect(documentUploadError(new Error('סוג הקובץ אינו נתמך'))).toBe('סוג הקובץ אינו נתמך'));
it('extends only document writes, not all requests',()=>{
 expect(requestTimeoutMs('/api/documents','POST')).toBe(DOCUMENT_REQUEST_TIMEOUT_MS);
 expect(requestTimeoutMs('/api/documents/id','PATCH')).toBe(DOCUMENT_REQUEST_TIMEOUT_MS);
 expect(requestTimeoutMs('/api/documents','GET')).toBe(12000);
 expect(requestTimeoutMs('/api/tasks','POST')).toBe(12000);
});
