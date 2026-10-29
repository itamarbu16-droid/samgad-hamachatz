import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RhythmGantt} from '../src/components/rhythm-gantt';
import type {Item,Occurrence} from '../src/components/task-composer';
const item:Item={id:'monthly',title:'Synthetic monthly review',description:'',creatorId:'owner',assigneeIds:['owner'],category:'task',hasDeadline:true,frequency:'monthly',startDate:'2026-01-01',endDate:null,completionMode:'individual',important:false,manualUrgent:false,archived:false,version:1};
const row:Occurrence={id:'period',itemId:'monthly',dueDate:'2026-01-31',scheduledDate:'2026-01-01',done:true,urgent:false,version:2,completions:{owner:'2026-01-05T12:00:00+02:00'},reports:{},completedAt:'2026-01-10T15:00:00Z',completedBy:'owner'};
const render=(items:Item[],occurrences:Occurrence[],month='2026-01')=>renderToStaticMarkup(createElement(RhythmGantt,{items,occurrences,month,today:'2026-01-20',busy:false,canWrite:true,filter:'all',onToggle:()=>{},onEdit:()=>{}}));
it('shows 31 individual day cells and a single mark on the actual execution day',()=>{
 const html=render([item],[row]);
 expect((html.match(/role="checkbox"/g)||[])).toHaveLength(31);
 expect((html.match(/aria-checked="true"/g)||[])).toHaveLength(1);
 expect(html).toContain('aria-checked="true" aria-label="Synthetic monthly review · 5.1');
 expect(html).not.toContain('colSpan="31"');
});
it('includes quarterly tasks in the monthly grid and retains a completion from another month',()=>{
 const quarterly={...item,id:'quarterly',frequency:'quarterly' as const};
 const quarterlyRow={...row,itemId:'quarterly'};
 const html=render([quarterly],[quarterlyRow],'2026-02');
 expect((html.match(/role="checkbox"/g)||[])).toHaveLength(28);
 expect((html.match(/aria-checked="true"/g)||[])).toHaveLength(0);
 expect(html).toContain('בוצע ב־5.1');
});
