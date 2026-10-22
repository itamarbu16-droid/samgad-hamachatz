import {it,expect} from 'vitest';
import {classifyResponsibility,buildResponsibilityEntries} from '../src/lib/responsibility-summary';
import {compareTasks} from '../src/lib/task-display';
import type {RhythmData,Item} from '../src/components/task-composer';
it('routes the requested roles, including punctuation variants',()=>{
 for(const role of ['ממחגית','ממח״גית','קט״א'])expect(classifyResponsibility('מעקב','',[role])).toEqual(['maintenance']);
 for(const role of ['מפ״מ','סמפ״מ','קל״ג'])expect(classifyResponsibility('מעקב','',[role])).toEqual(['logistics']);
 for(const role of ['חוג״ד','קרפ״גית'])expect(classifyResponsibility('מעקב','',[role])).toEqual(['medical']);
 expect(classifyResponsibility('מעקב','',['סמ״פ א׳'])).toEqual(['deputies']);
});
it('classifies personal notes and overrides broad logistics and deputy roles using content',()=>{
 expect(classifyResponsibility('חדר נוסף לצמ״ה','',[])).toEqual(['infrastructure']);
 expect(classifyResponsibility('תיקון מזגן','',['קל״ג'])).toEqual(['infrastructure']);
 expect(classifyResponsibility('תקלות בשירותים','',['סמ״פ א׳'])).toEqual(['infrastructure']);
 expect(classifyResponsibility('הובלת ציוד','',['קל״ג'])).toEqual(['transport']);
 expect(classifyResponsibility('תיאום הסעות','',['סמפ״מ'])).toEqual(['transport']);
 expect(classifyResponsibility('מעקב','',[],'org:communications')).toEqual(['communications']);
 expect(classifyResponsibility('נושא לא מסווג','',[])).toEqual([]);
});
it('uses deadlines ahead of urgency, pinned state and alphabetical order',()=>{
 const rows=[{id:'later',title:'א',dueDate:'2026-10-22',done:false,pinned:true},{id:'none',title:'ב',dueDate:null,done:false,pinned:true},{id:'late',title:'ג',dueDate:'2026-10-18',done:false},{id:'near',title:'ד',dueDate:'2026-10-20',done:false}];
 expect(rows.sort((a,b)=>compareTasks(a,b,'deadline_asc')).map(r=>r.id)).toEqual(['late','near','later','none']);
});
it('summarizes original items once, preserves points, and resolves renamed people from role groups',()=>{
 const item=(id:string,title:string,category='task',assigneeIds=['owner']):Item=>({id,title,category,assigneeIds,creatorId:'owner',description:'',hasDeadline:category!=='point',frequency:'once',startDate:'2026-10-20',endDate:null,completionMode:'individual',important:false,manualUrgent:false,archived:false,version:1});
 const data:RhythmData={today:'2026-10-19',month:'2026-10',groups:[{id:'g',name:'ממח״גית',emails:['role@example.com'],version:1}],people:[{id:'owner',name:'מפקד',email:'owner@example.com'},{id:'role',name:'שם פרטי',email:'role@example.com'}],items:[item('note','חדר נוסף לצמה','point'),{...item('repair','בדיקת רכב','task',['role']),frequency:'daily'}, {...item('archived','חדר ישן','point'),archived:true}],occurrences:[{id:'one',itemId:'repair',dueDate:'2026-10-20',done:false,urgent:false,version:1,completions:{},reports:{},completedAt:null,completedBy:null},{id:'two',itemId:'repair',dueDate:'2026-10-21',done:false,urgent:false,version:1,completions:{},reports:{},completedAt:null,completedBy:null}]};
 const rows=buildResponsibilityEntries([],data,'owner');expect(rows).toHaveLength(2);
 expect(rows.find(r=>r.id==='rhythm:note')).toMatchObject({kind:'point',domainIds:['infrastructure'],dueDate:null});
 expect(rows.find(r=>r.id==='rhythm:note')?.href).toContain('view=personal&tab=points');
 expect(rows.find(r=>r.id==='rhythm:repair')).toMatchObject({domainIds:['maintenance'],dueDate:'2026-10-20'});
});
