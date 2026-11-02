import { describe, it, expect } from 'vitest';
import { project, type Pending } from '../src/lib/offline';
const user = {id:'manager'};
const op = (url:string, body:Record<string,unknown>, method='PATCH'):Pending => ({id:'request',url,body,method,title:'test'});
const snapshot = () => ({today:'2026-10-15',items:[{id:'item',creatorId:'manager',assigneeIds:['soldier'],completionMode:'individual',version:1}],occurrences:[{id:'occ',itemId:'item',reports:{},completions:{},done:false,version:1}]});
describe('offline state projection preserves the approval workflow',()=>{
 it('keeps a subordinate completion pending until creator approval, including repeated renders',()=>{
  const base=snapshot();const report=op('/api/rhythm/occurrences/occ',{version:1,done:true});
  const reported=project(base,[report],{id:'soldier'});
  expect(reported.occurrences[0].done).toBe(false);expect(reported.occurrences[0].reports.soldier).toBeTruthy();
  expect(base.occurrences[0].reports).toEqual({});
  const approved=project(reported,[op('/api/rhythm/occurrences/occ',{version:2,done:true,recipientId:'soldier',review:'approve'})],user);
  expect(approved.occurrences[0].done).toBe(true);
 });
 it('removes a rejected report and restores unfinished status',()=>{
  const base=project(snapshot(),[op('/api/rhythm/occurrences/occ',{version:1,done:true})],{id:'soldier'});
  const rejected=project(base,[op('/api/rhythm/occurrences/occ',{version:2,done:false,recipientId:'soldier',review:'reject'})],user);
  expect(rejected.occurrences[0].reports).toEqual({});expect(rejected.occurrences[0].done).toBe(false);
 });
 it('adds an undated private point and task without making a date mandatory',()=>{
  const result=project({today:'2026-10-15',items:[],occurrences:[]},[op('/api/rhythm/items',{title:'נקודה',category:'point'},'POST')],user);
  expect(result.items[0].assigneeIds).toEqual(['manager']);expect(result.items[0].hasDeadline).toBe(false);expect(result.occurrences[0].itemId).toBe(result.items[0].id);
 });
 it('preserves legacy task review instead of closing an assigned task prematurely',()=>{
  const result=project({tasks:[{id:'task',ownerId:'soldier',creatorId:'manager',version:1,status:'open'}]},[op('/api/tasks/task',{version:1,status:'completed'})],{id:'soldier'});
  expect(result.tasks[0].status).toBe('pending_review');
 });
});
it('retains the selected checklist execution day while a save is queued',()=>{
 const base=snapshot();base.items[0].assigneeIds=['manager'];
 const result=project(base,[op('/api/rhythm/occurrences/occ',{version:1,done:true,performedOn:'2026-10-05'})],user);
 expect(result.occurrences[0].done).toBe(true);
 expect(result.occurrences[0].completions.manager).toBe('2026-10-05T12:00:00+02:00');
});
