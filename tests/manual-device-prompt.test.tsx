// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ManualDevicePrompt} from '../src/components/manual-device-prompt';

const client=vi.hoisted(()=>({getManualDeviceState:vi.fn(),enableManualDevice:vi.fn(),disableManualDevice:vi.fn()}));
vi.mock('../src/lib/manual-device-client',()=>client);
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
const account=(id:string)=>JSON.stringify(['synthetic-workspace',id]);
let root:Root,host:HTMLDivElement;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);client.getManualDeviceState.mockReset();client.enableManualDevice.mockReset();client.disableManualDevice.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();sessionStorage.clear();});
function button(label:string){return Array.from(host.querySelectorAll('button')).find(el=>el.textContent===label);}
async function draw(id:string,preferences=false){
 await act(async()=>root.render(<ManualDevicePrompt key={id+String(preferences)} account={account(id)} preferences={preferences}/>));
}
async function click(target:HTMLButtonElement){await act(async()=>target.click());}

it('shows first-run action only until dismissed; does not hide a different account or preferences',async()=>{
 client.getManualDeviceState.mockResolvedValue({state:'ready',context:'opaque'});
 await draw('first');
 expect(button('הפעלת תזכורות ידניות')).toBeTruthy();
 expect(client.enableManualDevice).not.toHaveBeenCalled();
 await click(button('לא עכשיו')!);
 expect(host.querySelector('section')).toBeNull();
 await draw('second');
 expect(button('הפעלת תזכורות ידניות')).toBeTruthy();
 await draw('first');
 expect(host.querySelector('section')).toBeNull();
 await draw('first',true);
 expect(button('הפעלת תזכורות ידניות')).toBeTruthy();
});
it.each([['install','הוספה למסך הבית'],['denied','בהגדרות ההתראות']])('gives %s guidance instead of requesting a permission',async(state,text)=>{
 client.getManualDeviceState.mockResolvedValue({state,context:'opaque'});
 await draw(state);
 expect(host.textContent).toContain(text);
 expect(button('הפעלת תזכורות ידניות')).toBeUndefined();
 expect(client.enableManualDevice).not.toHaveBeenCalled();
});
it('shows only the settings confirmation when already registered',async()=>{
 client.getManualDeviceState.mockResolvedValue({state:'registered',context:'opaque'});
 await draw('registered');
 expect(host.querySelector('section')).toBeNull();
 await draw('registered',true);
 expect(host.textContent).toContain('המכשיר רשום לקבלת תזכורות ידניות לחשבון הזה');
 expect(button('הפעלת תזכורות ידניות')).toBeUndefined();
});
it('activation requires a click with the exact account context',async()=>{
 client.getManualDeviceState.mockResolvedValue({state:'ready',context:'opaque-context'});
 client.enableManualDevice.mockResolvedValue('denied');
 await draw('enable');
 await click(button('הפעלת תזכורות ידניות')!);
 expect(client.enableManualDevice).toHaveBeenCalledExactlyOnceWith('opaque-context',expect.any(AbortSignal));
 expect(host.textContent).toContain('בהגדרות ההתראות');
});
