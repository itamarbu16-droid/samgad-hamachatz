import { describe,it,expect } from 'vitest';
import { canRead, assertTransition, isOverdue, localDate, calculateMetrics, type Principal } from '../src/server/policy';
import { updateTaskInput,createTaskInput } from '../src/server/validation';
const manager:Principal={userId:'u1',name:'Manager',organizationId:'org-a',role:'company_commander',companyId:'a',domainId:null};
describe('scope policy',()=>{
  it('isolates companies, organizations and organization-wide data',()=>{
    expect(canRead(manager,{organizationId:'org-a',companyId:'a',domainId:'safety'})).toBe(true);
    expect(canRead(manager,{organizationId:'org-a',companyId:'b',domainId:'safety'})).toBe(false);
    expect(canRead(manager,{organizationId:'org-b',companyId:'a',domainId:'safety'})).toBe(false);
    expect(canRead(manager,{organizationId:'org-a',companyId:null,domainId:'safety'})).toBe(false);
  });
  it('contributor sees only assignments within both scopes; administrator not automatically content privileged',()=>{
    const contributor={...manager,role:'contributor',domainId:'safety'};
    expect(canRead(contributor,{organizationId:'org-a',companyId:'a',domainId:'safety',ownerId:'u1'})).toBe(true);
    expect(canRead(contributor,{organizationId:'org-a',companyId:'a',domainId:'safety',ownerId:'u2'})).toBe(false);
    expect(canRead(contributor,{organizationId:'org-a',companyId:'a',domainId:'logistics',ownerId:'u1'})).toBe(false);
    expect(canRead({...manager,role:'admin'},{organizationId:'org-a',companyId:'a',domainId:'safety'})).toBe(false);
  });
});
describe('task lifecycle',()=>{
  it('allows direct completion and requires review when configured',()=>{
    expect(()=>assertTransition(manager,{status:'open',requiresReview:false},'completed')).not.toThrow();
    expect(()=>assertTransition(manager,{status:'pending_review',requiresReview:false,creatorId:'another',ownerId:'u1'},'completed')).toThrow();
    expect(()=>assertTransition(manager,{status:'in_progress',requiresReview:true},'completed')).toThrow();
    expect(()=>assertTransition(manager,{status:'pending_review',requiresReview:true},'completed')).not.toThrow();
    expect(()=>assertTransition({...manager,role:'contributor'},{status:'pending_review',requiresReview:true},'completed')).toThrow();
  });
  it('reserves cancellation and reopening for managers',()=>{
    expect(()=>assertTransition({...manager,role:'contributor'},{status:'open',requiresReview:false},'cancelled')).toThrow();
    expect(()=>assertTransition(manager,{status:'completed',requiresReview:false},'in_progress')).not.toThrow();
    expect(()=>assertTransition({...manager,role:'contributor'},{status:'completed',requiresReview:false},'in_progress')).toThrow();
  });
});
describe('date and metric definitions',()=>{
  it('uses Jerusalem midnight in summer and winter',()=>{
    expect(localDate(new Date('2026-07-01T21:01:00Z'))).toBe('2026-07-02');
    expect(localDate(new Date('2026-01-01T21:01:00Z'))).toBe('2026-01-01');
    expect(localDate(new Date('2026-01-01T22:01:00Z'))).toBe('2026-01-02');
  });
  it('excludes terminal and missing deadlines; due today is not overdue',()=>{
    expect(isOverdue({status:'open',dueDate:'2026-10-12'},'2026-10-13')).toBe(true);
    for(const task of [{status:'open',dueDate:'2026-10-13'},{status:'completed',dueDate:'2026-10-12'},{status:'cancelled',dueDate:'2026-10-12'},{status:'open',dueDate:null}]) expect(isOverdue(task,'2026-10-13')).toBe(false);
    expect(calculateMetrics([{status:'blocked',dueDate:'2026-10-12',priority:'urgent'},{status:'completed',dueDate:'2026-10-12',priority:'urgent'}],'2026-10-13')).toEqual({open:1,overdue:1,blocked:1,urgent:1,completed:1});
  });
});
describe('input boundaries',()=>{
  it('does not fill an absent patch description with a default',()=>expect(updateTaskInput.parse({version:1,status:'in_progress'})).toEqual({version:1,status:'in_progress'}));
  it('rejects impossible dates, client roles and missing ownership',()=>{
    expect(createTaskInput.safeParse({title:'Title',ownerId:'u',domainId:'d',dueDate:'2026-02-30'}).success).toBe(false);
    expect(createTaskInput.safeParse({title:'Title',ownerId:'u',domainId:'d',role:'deputy'}).success).toBe(false);
    expect(createTaskInput.safeParse({title:'Title',domainId:'d'}).success).toBe(false);
  });
});
