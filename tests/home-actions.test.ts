// @vitest-environment happy-dom
import React,{act,createElement as h} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import CommandDashboard from '../src/components/command-dashboard';
vi.mock('../src/components/use-rhythm',()=>({currentMonth:()=> '2026-11',useRhythm:()=>({data:{items:[],occurrences:[]},load:vi.fn()})}));
vi.mock('../src/components/task-actions',()=>({SwipeTaskRow:({children,...props}:{children:React.ReactNode;task:{id:string}})=>h('div',{'data-swipe':props.task.id},children),TaskActions:({title,...props}:{title:string;canDelete:boolean;version:number})=>h('button',{'data-delete':props.canDelete,'data-version':props.version},`פעולות ${title}`)}));
Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('offers the same versioned swipe actions on home without nesting buttons in links',async()=>{
 await act(async()=>root.render(h(CommandDashboard,{user:{id:'owner',name:'מנהל'},tasks:[{id:'t1',title:'בדיקה',status:'open',dueDate:'2026-11-11',ownerId:'other',creatorId:'owner',version:4}],users:[],today:'2026-11-11',activity:[],go:vi.fn(),canWrite:true,manager:true,ownerInterface:true})));
 expect(host.querySelector('[data-swipe=t1]')).not.toBeNull();expect(host.querySelector('[data-version="4"]')?.getAttribute('data-delete')).toBe('true');expect(host.querySelector('a button')).toBeNull();
});
it('does not expose delete permission for read-only users',async()=>{
 await act(async()=>root.render(h(CommandDashboard,{user:{id:'owner',name:'מנהל'},tasks:[{id:'t1',title:'בדיקה',status:'open',dueDate:null,ownerId:'other',creatorId:'other',version:4}],users:[],today:'2026-11-11',activity:[],go:vi.fn()})));
 expect(host.querySelector('[data-version="4"]')?.getAttribute('data-delete')).toBe('false');
});
