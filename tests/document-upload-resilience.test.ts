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
it('waits for a slower in-flight success after failure and starts no further batch',async()=>{
 const file=new File([new Uint8Array(4*1024*1024)],'synthetic.jpg');const cache=new Map();
 let release:()=>void=()=>{};const slow=new Promise<void>(resolve=>{release=resolve;});
 const indices:number[]=[];let finished=false;
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  const b=JSON.parse(String(init.body));if(!url.endsWith('/chunks'))return Response.json({received:[]});
  indices.push(b.index);if(b.index===0)throw new TypeError('Load failed');
  await slow;return Response.json({received:b.index});
 }));
 const outcome=prepareDocumentFiles([file],cache,()=>{}).then(()=>null,e=>e).finally(()=>{finished=true;});
 while(indices.length<2)await new Promise(r=>setTimeout(r,1));
 await new Promise(r=>setTimeout(r,5));expect(finished).toBe(false);expect(indices).toEqual([0,1]);
 release();expect(await outcome).toBeInstanceOf(TypeError);expect(indices).toEqual([0,1]);
});
it('caps concurrency at two and reports monotonic acknowledged progress',async()=>{
 const file=new File([new Uint8Array(5*1024*1024)],'synthetic.jpg');let active=0,peak=0;
 const percentages:number[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  const b=JSON.parse(String(init.body));if(!url.endsWith('/chunks'))return Response.json({received:[0]});
  active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,b.index%2?8:2));active--;
  return Response.json({received:b.index});
 }));
 await prepareDocumentFiles([file],new Map(),m=>{const value=m.match(/(\d+)%/);if(value)percentages.push(Number(value[1]));});
 expect(peak).toBe(2);expect(active).toBe(0);expect(percentages[0]).toBe(20);
 expect(percentages.at(-1)).toBe(100);expect(percentages).toEqual([...percentages].sort((a,b)=>a-b));
});
