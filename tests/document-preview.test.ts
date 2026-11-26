import {beforeEach, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks = vi.hoisted(() => ({download:vi.fn(),principal:{userId:'viewer',organizationId:'synthetic'}}));
vi.mock('../src/server/documents', () => ({downloadDocument:mocks.download}));
vi.mock('../src/server/http', () => ({api:async(_request:Request, work:(principal:unknown)=>Promise<unknown>)=>{try{return await work(mocks.principal);}catch{return new Response(null,{status:403});}}}));
import {GET} from '../src/app/api/documents/files/[id]/route';
import nextConfig from '../next.config';
import {DocumentAttachmentPreview} from '../src/components/document-library';
beforeEach(()=>{mocks.download.mockReset();});
const request=(query='')=>GET(new Request('https://example.test/api/documents/files/file'+query),{params:Promise.resolve({id:'file'})});
it.each(['application/pdf','image/png','image/jpeg'])('previews %s through the authenticated file service with private security headers',async contentType=>{
 mocks.download.mockResolvedValue({bytes:Buffer.from('synthetic'),filename:'קובץ.pdf',contentType});
 const response=await request('?preview=1') as Response;
 expect(mocks.download).toHaveBeenCalledWith(mocks.principal,'file');
 expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(response.headers.get('x-content-type-options')).toBe('nosniff');
 expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
 expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
 expect(await response.text()).toBe('synthetic');
});
it.each(['text/html','image/svg+xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])('never renders %s inline',async contentType=>{
 mocks.download.mockResolvedValue({bytes:Buffer.from('synthetic'),filename:'file',contentType});
 const response=await request('?preview=1') as Response;
 expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
});
it('keeps the original download URL as an attachment',async()=>{
 mocks.download.mockResolvedValue({bytes:Buffer.from('synthetic'),filename:'file.pdf',contentType:'application/pdf'});
 expect((await request() as Response).headers.get('content-disposition')).toMatch(/^attachment;/);
});
it('does not bypass document access denial for preview',async()=>{
 mocks.download.mockImplementation(async()=>{throw new Error('not authorized');});
 const response=await request('?preview=1') as Response;
 expect(response.status).toBe(403);
 expect(response.headers.get('content-disposition')).toBeNull();
});
it('renders a PDF immediately with an accessible title and fullscreen fallback',()=>{
 const html=renderToStaticMarkup(createElement(DocumentAttachmentPreview,{file:{id:'scan',filename:'סריקה.pdf',byteSize:50,contentType:'application/pdf'}}));
 expect(html).toContain('<iframe');expect(html).toContain('title="סריקה.pdf"');
 expect(html).toContain('/api/documents/files/scan?preview=1');expect(html).toContain('פתיחה במסך מלא');
 expect(html).not.toContain('https://');
});
it('renders scanned images and does not embed unsupported files',()=>{
 const image=renderToStaticMarkup(createElement(DocumentAttachmentPreview,{file:{id:'scan',filename:'סריקה.png',byteSize:50,contentType:'image/png'}}));
 expect(image).toContain('<img');expect(image).toContain('alt="סריקה.png"');
 expect(renderToStaticMarkup(createElement(DocumentAttachmentPreview,{file:{id:'sheet',filename:'sheet.xlsx',byteSize:50,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}}))).toBe('');
});

it('scopes the final frame-header override to authenticated attachment paths',async()=>{
 const headers=await nextConfig.headers!();
 const globalIndex=headers.findIndex(rule=>rule.source==='/:path*');
 const previewIndex=headers.findIndex(rule=>rule.source==='/api/documents/files/:id');
 expect(previewIndex).toBeGreaterThan(globalIndex);
 expect(headers[globalIndex].headers).toContainEqual({key:'X-Frame-Options',value:'DENY'});
 expect(headers[previewIndex].headers).toContainEqual({key:'X-Frame-Options',value:'SAMEORIGIN'});
});
