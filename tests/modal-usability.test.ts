// @vitest-environment happy-dom
import React, {act, createElement as h, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Modal} from '../src/components/workspace-primitives';
import {TaskCompletionSummary} from '../src/components/task-completion-summary';

Object.assign(globalThis, {React, IS_REACT_ACT_ENVIRONMENT: true});
let host: HTMLDivElement, root: Root;
beforeEach(() => { host=document.createElement('div'); document.body.append(host); root=createRoot(host); });
afterEach(async () => { await act(async()=>root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function click(button: HTMLElement) { await act(async()=>button.click()); }
function byText(text:string) { return Array.from(document.querySelectorAll('button')).find(el=>el.textContent===text)!; }

it('keeps unsaved form values when choosing continue editing', async()=>{
  function Form(){const [value,setValue]=useState('');return h('input',{value,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setValue(e.target.value),'aria-label':'draft'});}
  await act(async()=>root.render(h(Modal,{title:'test',close:vi.fn(),children:h(Form)})));
  const input=document.querySelector('input')!;
  // Native input change as React sees it, without replacing the component.
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'unsaved draft');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(document.querySelector('button[aria-label="סגירה"]')!);
  expect(byText('המשך עריכה')).toBeTruthy();
  expect(document.activeElement).toBe(byText('המשך עריכה'));
  expect(input.closest('[hidden]')).not.toBeNull();
  await click(byText('המשך עריכה'));
  expect(document.querySelector('input')).toBe(input);
  expect(input.value).toBe('unsaved draft');
  expect(input.closest('[hidden]')).toBeNull();
});
it('isolates the background and restores it and focus after closing',async()=>{
 const trigger=document.createElement('button');host.append(trigger);trigger.focus();
 await act(async()=>root.render(h(Modal,{title:'test',close:vi.fn(),children:h('button',null,'inside')})));
 expect(host.inert).toBe(true);
 expect(document.activeElement?.getAttribute('role')).toBe('dialog');
 await act(async()=>root.render(null));
 expect(host.inert).toBe(false);
});
it('handles Escape only in the topmost dialog',async()=>{
 const outer=vi.fn(),inner=vi.fn();
 await act(async()=>root.render(h(Modal,{title:'outer',close:outer,children:h(Modal,{title:'inner',close:inner,children:'inner content'})})));
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 expect(inner).toHaveBeenCalledOnce();expect(outer).not.toHaveBeenCalled();
 await act(async()=>root.render(null));
 expect(document.body.style.overflow).not.toBe('hidden');
 expect(host.inert).toBe(false);
});
it('keeps group actions collapsed with completed and pending counts, without dropping actions',async()=>{
 await act(async()=>root.render(h(TaskCompletionSummary,{total:7,completed:3,pending:2,children:h('button',null,'approve')})));
 expect(document.querySelector('details')?.open).toBe(false);
 expect(document.querySelector('summary')?.textContent).toContain('3 מתוך 7 ביצעו');
 expect(document.querySelector('summary')?.textContent).toContain('2 ממתינים לאישור');
 expect(byText('approve')).toBeTruthy();
});
it('shows a single assignee action directly',async()=>{
 await act(async()=>root.render(h(TaskCompletionSummary,{total:1,completed:0,pending:0,children:h('button',null,'complete')})));
 expect(document.querySelector('details')).toBeNull();expect(byText('complete')).toBeTruthy();
});
