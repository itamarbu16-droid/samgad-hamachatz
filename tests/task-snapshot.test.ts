import {it,expect} from 'vitest';
import {isPersonalTask,summarizeTasks} from '../src/lib/task-snapshot';
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
it('counts undated tasks and completed work and separates urgent from overdue',()=>{
 const tasks=[{done:false,dueDate:null},{done:false,dueDate:'2026-10-16'},{done:false,dueDate:'2026-10-17'},{done:false,dueDate:'2026-10-18'},{done:false,dueDate:'2026-10-19'},{done:true,dueDate:'2026-10-16'}];
 expect(summarizeTasks(tasks,'2026-10-17')).toEqual({total:6,completed:1,urgent:2,overdue:1});
 expect(tasks.filter(t=>matchesTaskFilter(t,'due_soon','2026-10-17'))).toHaveLength(2);
 expect(summarizeTasks([],'2026-10-17')).toEqual({total:0,completed:0,urgent:0,overdue:0});
});
