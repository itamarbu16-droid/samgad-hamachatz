import {it,expect} from 'vitest';
import {isPersonalTask,summarizeTasks,personalSnapshotTasks,personalItemInTab,personalItemTab} from '../src/lib/task-snapshot';
import {isPersonalItem} from '../src/lib/unit-roles';
import {matchesTaskFilter} from '../src/lib/task-display';
it('keeps personal work separate even when the manager owns a shared task',()=>{
 const legacy=[{creatorId:'me',ownerId:'me'},{creatorId:'me',ownerId:'deputy'},{creatorId:'other',ownerId:'me'}];
 expect(legacy.filter(t=>isPersonalTask(t,'me'))).toHaveLength(1);
 expect(legacy.filter(t=>!isPersonalTask(t,'me'))).toHaveLength(2);
 const modern=[{creatorId:'me',assigneeIds:['me']},{creatorId:'me',assigneeIds:['me','deputy']},{creatorId:'other',assigneeIds:['me']}];
 expect(modern.filter(t=>isPersonalItem(t,'me'))).toHaveLength(1);
 expect(modern.filter(t=>!isPersonalItem(t,'me'))).toHaveLength(2);
});
it('excludes every recurring frequency from all personal overview cards without changing history',()=>{
 const once=(dueDate:string,done=false)=>({item:{frequency:'once',archived:false,category:'task',hasDeadline:true},occurrence:{dueDate,done}});
 const personal=[once('2026-11-01'),once('2026-11-02'),once('2026-11-03'),once('2026-10-01',true)];
 const recurring=['daily','weekly','fortnightly','monthly','quarterly','semiannual','annual'].flatMap(frequency=>[
  {...once('2026-10-01'),item:{...once('').item,frequency}},
  {...once('2026-11-02'),item:{...once('').item,frequency}},
  {...once('2026-11-03',true),item:{...once('').item,frequency}}
 ]);
 const rows=[...personal,...recurring];const before=structuredClone(rows);
 const tasks=personalSnapshotTasks(rows,[]);
 expect(summarizeTasks(tasks,'2026-11-02')).toEqual({total:4,completed:1,urgent:2,overdue:1});
 expect(rows).toEqual(before);
 expect(personalSnapshotTasks(recurring,[])).toEqual([]);
});
it('excludes points and archived/cancelled tasks, includes undated and completed personal one-offs',()=>{
 const row={item:{frequency:'once',archived:false,category:'task',hasDeadline:false},occurrence:{done:false,dueDate:'2026-10-01'}};
 const records=[row,{...row,item:{...row.item,category:'point'}},{...row,item:{...row.item,archived:true}}];
 const tasks=personalSnapshotTasks(records,[{status:'completed',dueDate:'2026-10-01'},{status:'cancelled',dueDate:'2026-10-01'},{status:'open',dueDate:null}]);
 expect(summarizeTasks(tasks,'2026-11-02')).toEqual({total:3,completed:1,urgent:0,overdue:0});
 expect(tasks[0].dueDate).toBeNull();
});
it('does not add shared work back after ownership filtering or collapse distinct tasks by date',()=>{
 const row={item:{frequency:'once',archived:false,category:'task',hasDeadline:true,creatorId:'owner',assigneeIds:['owner']},occurrence:{done:false,dueDate:'2026-11-02'}};
 const shared={...row,item:{...row.item,assigneeIds:['owner','other']}};
 const delegated={...row,item:{...row.item,creatorId:'other'}};
 const records=[row,{...row},shared,delegated].filter(r=>isPersonalItem(r.item,'owner'));
 expect(personalSnapshotTasks(records,[])).toHaveLength(2);
});
it('counts undated tasks and completed work and separates urgent from overdue',()=>{
 const tasks=[{done:false,dueDate:null},{done:false,dueDate:'2026-10-16'},{done:false,dueDate:'2026-10-17'},{done:false,dueDate:'2026-10-18'},{done:false,dueDate:'2026-10-19'},{done:true,dueDate:'2026-10-16'}];
 expect(summarizeTasks(tasks,'2026-10-17')).toEqual({total:6,completed:1,urgent:2,overdue:1});
 expect(tasks.filter(t=>matchesTaskFilter(t,'due_soon','2026-10-17'))).toHaveLength(2);
 expect(summarizeTasks([],'2026-10-17')).toEqual({total:0,completed:0,urgent:0,overdue:0});
});

it('keeps checklist out of personal tasks and historical all links, including list counts under every status filter',()=>{
 const records=['once','daily','weekly','fortnightly','monthly','quarterly','semiannual','annual'].flatMap(frequency=>[false,true].map(done=>({item:{frequency,archived:false,category:'task',hasDeadline:true},occurrence:{done,dueDate:'2026-11-01'}})));
 const before=structuredClone(records);
 for(const tab of ['tasks','all'])for(const filter of ['all','open','completed','overdue','due_soon']){
  const visible=records.filter(r=>personalItemInTab(r.item,tab)&&matchesTaskFilter(r.occurrence,filter,'2026-11-02'));
  expect(visible.every(r=>r.item.frequency==='once')).toBe(true);
  expect(visible).toHaveLength(records.filter(r=>r.item.frequency==='once'&&matchesTaskFilter(r.occurrence,filter,'2026-11-02')).length);
 }
 const checklist=records.filter(r=>personalItemInTab(r.item,'rhythm'));
 expect(checklist).toHaveLength(14);
 expect(checklist.every(r=>personalItemTab(r.item)==='rhythm')).toBe(true);
 expect(personalItemTab({frequency:'once',category:'point'})).toBe('points');
 expect(personalItemInTab({frequency:'once',category:'point',archived:false},'tasks')).toBe(false);
 expect(records).toEqual(before);
});
