// @vitest-environment happy-dom
import React, {act, createElement as h} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import QuickPointSetup from '../src/components/quick-point-setup';
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
let host: HTMLDivElement, root: Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
function button(text:string){return Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;}
it('requires explicit consent and never generates a token on page load',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({active:false,expiresAt:null,lastUsedAt:null}));
 await act(async()=>root.render(h(QuickPointSetup)));
 expect(fetcher).toHaveBeenCalledTimes(1);expect(button('יצירת הרשאה לקיצור הדרך').disabled).toBe(true);
 expect(host.querySelector('input[type=password]')).toBeNull();
 expect(host.textContent).toContain('העתק את ההודעה');
 expect(host.textContent).toContain('ניסיון ראשוני עם הגדרה ידנית');
});
it('only creates after consent and discards the local credential on revoke',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({active:false,expiresAt:null,lastUsedAt:null}))
 .mockResolvedValueOnce(Response.json({token:'qp_test',expiresAt:'2027-01-01T00:00:00Z'}))
 .mockResolvedValueOnce(Response.json({revoked:true}));
 await act(async()=>root.render(h(QuickPointSetup)));
 await act(async()=>host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
 await act(async()=>button('יצירת הרשאה לקיצור הדרך').click());
 expect(fetcher.mock.calls[1][1]).toMatchObject({method:'POST',body:JSON.stringify({consent:true})});
 expect(host.querySelector<HTMLInputElement>('input[type=password]')?.value).toBe('Bearer qp_test');
 await act(async()=>button('ביטול ההרשאה').click());
 expect(host.querySelector('input[type=password]')).toBeNull();
});
it('shows login error instead of setup controls when app session is unavailable',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:'יש להתחבר'},{status:401}));
 await act(async()=>root.render(h(QuickPointSetup)));
 expect(host.querySelector('[role=alert]')?.textContent).toBe('יש להתחבר');
 expect(button('יצירת הרשאה לקיצור הדרך')).toBeUndefined();
});
