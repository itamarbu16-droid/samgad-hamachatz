import { expect, it } from 'vitest';
import { hasPendingReport,matchesTaskFilter } from '../src/lib/task-display';

const today='2026-10-15';
const reported={done:false,pending:true,dueDate:'2026-10-14'};
const ready={done:false,pending:false,dueDate:'2026-10-16'};
const approved={done:true,pending:false,dueDate:'2026-10-14'};

it('separates work to perform from reports already awaiting approval',()=>{
 expect([reported,ready,approved].filter(t=>matchesTaskFilter(t,'actionable',today))).toEqual([ready]);
 expect([reported,ready,approved].filter(t=>matchesTaskFilter(t,'pending_review',today))).toEqual([reported]);
 expect(matchesTaskFilter(reported,'pending',today)).toBe(true);
 expect(matchesTaskFilter(approved,'pending_review',today)).toBe(false);
});

it('makes deadline summary filters select the same items in either task source',()=>{
 expect([reported,ready,approved].filter(t=>matchesTaskFilter(t,'tomorrow',today))).toEqual([ready]);
 expect([reported,ready,approved].filter(t=>matchesTaskFilter(t,'overdue',today))).toEqual([reported]);
 expect(matchesTaskFilter({...ready,dueDate:null},'tomorrow',today)).toBe(false);
 expect(matchesTaskFilter({...reported,cancelled:true},'overdue',today)).toBe(false);
 expect(matchesTaskFilter({...ready,dueDate:'2027-01-01'},'tomorrow','2026-12-31')).toBe(true);
});

it('supports both legacy owner fields and recurring recipient lists for the shared mine filter',()=>{
 expect(matchesTaskFilter({...ready,ownerId:'me'},'mine',today,'me')).toBe(true);
 expect(matchesTaskFilter({...ready,assigneeIds:['other','me']},'mine',today,'me')).toBe(true);
 expect(matchesTaskFilter({...ready,assigneeIds:['other']},'mine',today,'me')).toBe(false);
 expect(matchesTaskFilter(approved,'completed',today)).toBe(true);
});

it('keeps a group task actionable for a deputy who has not reported, independently of colleagues',()=>{
 const reports={other:'2026-10-15T08:00:00Z'};
 expect(hasPendingReport(reports,{},'me')).toBe(false);
 expect(hasPendingReport(reports,{},'other')).toBe(true);
 expect(hasPendingReport(reports,{})).toBe(true);
 expect(matchesTaskFilter({...ready,pending:hasPendingReport(reports,{},'me')},'actionable',today)).toBe(true);
 expect(hasPendingReport(reports,{other:'2026-10-15T09:00:00Z'})).toBe(false);
 expect(matchesTaskFilter({...ready,cancelled:true},'all',today)).toBe(false);
});
