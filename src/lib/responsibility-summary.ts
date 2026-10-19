import {responsibilityDomains} from './responsibility-domains';
import {compareTasks} from './task-display';
import {isPersonalItem} from './unit-roles';
import {isPersonalTask} from './task-snapshot';
import type {RhythmData} from '../components/task-composer';
export type ResponsibilityEntry={id:string;title:string;description:string;kind:'task'|'point';dueDate:string|null;done:boolean;owner:string;href:string;domainIds:string[]};
type LegacyTask={id:string;title:string;description:string;status:string;dueDate:string|null;creatorId:string;ownerId:string;domainId:string};
const normalize=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,'').replace(/["'״׳`]/g,'').replace(/[-–—]/g,' ').replace(/\s+/g,' ').trim();
/** Content takes precedence over an assignee whose work spans several domains. */
export function classifyResponsibility(title:string,description:string,roles:string[],fallback?:string):string[]{
 const text=normalize(title+' '+description),assignees=normalize(roles.join(' '));
 const matches=(pattern:RegExp)=>pattern.test(text);
 if(matches(/הובל|הסע[התו]|שינוע|משאית|אוטובוס|מיניבוס/))return ['transport'];
 if(matches(/בינוי|חדר|מזג[ןנ]|שירותים|מקלח|ביוב|אינסטלצ|נזיל|צנרת|גג|תקר[הת]|דלת|חלון|חשמל|תאור[הת]|מבנה|מכול[הת]|מים חמים/))return ['infrastructure'];
 const result=new Set<string>();
 const source=assignees+' '+text;
 if(/ממחגית|ממחג|קטא|טנא/.test(source))result.add('maintenance');
 if(/סמפמ|מפמ|קלג|לוגיסט/.test(source))result.add('logistics');
 if(/חוגד|קרפגית|רפוא[הת]|מרפא[הת]/.test(source))result.add('medical');
 if(/סקשרגית|תקשוב|קשרג/.test(source))result.add('communications');
 if(/נשקי[יה]|תחמושת/.test(source))result.add('armory');
 // סמפ״מ is logistics, while the company deputies belong to סמ״פים.
 if(/סמפים|סמפ(?!מ)/.test(source))result.add('deputies');
 if(!result.size&&fallback){const id=fallback.split(':').at(-1)!;if(responsibilityDomains.some(d=>d.id===id))result.add(id);}
 return [...result];
}
export function buildResponsibilityEntries(tasks:LegacyTask[],rhythm:RhythmData,workspaceOwnerId:string):ResponsibilityEntry[]{
 const people=new Map(rhythm.people.map(p=>[p.id,p]));
 const roles=(ids:string[])=>ids.flatMap(id=>{const p=people.get(id);return p?[p.name,...rhythm.groups.filter(g=>p.email&&g.emails.some(e=>e.toLowerCase()===p.email.toLowerCase())).map(g=>g.name)]:[];});
 const entries:ResponsibilityEntry[]=tasks.filter(t=>t.status!=='cancelled').map(t=>({
  id:'task:'+t.id,title:t.title,description:t.description,kind:'task',dueDate:t.dueDate,done:t.status==='completed',owner:people.get(t.ownerId)?.name||'',
  domainIds:classifyResponsibility(t.title,t.description,roles([t.ownerId]),t.domainId),
  href:`/?view=${isPersonalTask(t,workspaceOwnerId)?'personal':'tasks'}&task=${encodeURIComponent(t.id)}`,
 }));
 const occurrences=new Map<string,RhythmData['occurrences']>();
 for(const o of rhythm.occurrences){const list=occurrences.get(o.itemId)||[];list.push(o);occurrences.set(o.itemId,list);}
 for(const item of rhythm.items){
  if(item.archived)continue;
  const rows=occurrences.get(item.id)||[];
  // A recurring item is summarized once, using its earliest outstanding occurrence.
  const ordered=[...rows].sort((a,b)=>Number(a.done)-Number(b.done)||a.dueDate.localeCompare(b.dueDate));
  const occurrence=ordered[0];
  const personal=isPersonalItem(item,workspaceOwnerId);
  entries.push({id:'rhythm:'+item.id,title:item.title,description:item.description,kind:item.category==='point'?'point':'task',
   dueDate:item.category!=='point'&&item.hasDeadline?(occurrence?.dueDate||item.startDate):null,done:rows.length>0&&rows.every(o=>o.done),
   owner:item.assigneeIds.map(id=>people.get(id)?.name||'').filter(Boolean).join(', '),domainIds:classifyResponsibility(item.title,item.description,roles(item.assigneeIds)),
   href:`/?view=${personal?'personal':'tasks'}&tab=${item.category==='point'?'points':'all'}&filter=all${occurrence?`&occurrence=${encodeURIComponent(occurrence.id)}`:''}`,
  });
 }
 return entries.sort((a,b)=>compareTasks(a,b,'deadline_asc'));
}
