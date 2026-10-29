import {describe,it,expect} from 'vitest';
import {periodSegments,periodAnchor,calendarPeriodEnd} from '../src/lib/rhythm-periods';
const item=(frequency:'daily'|'weekly'|'monthly'|'quarterly'|'semiannual'|'annual',startDate='2026-01-01')=>({frequency,startDate,endDate:null});
describe('period checklist boundaries',()=>{
 it('gives each day its own completion key including leap day',()=>{
  const periods=periodSegments(item('daily','2028-02-01'),'2028-02');
  expect(periods).toHaveLength(29);expect(periods.every(p=>p.days===1)).toBe(true);
  expect(periods.at(-1)?.start).toBe('2028-02-29');
 });
 it('keeps monthly completion keyed to the month, independent of execution date',()=>{
  expect(periodSegments(item('monthly'),'2026-10')).toEqual([{start:'2026-10-01',end:'2026-10-31',from:'2026-10-01',to:'2026-10-31',days:31}]);
  expect(periodSegments(item('monthly'),'2026-11')[0].start).toBe('2026-11-01');
 });
 it('retains a single long-period key across months and resets at the quarter boundary',()=>{
  expect(periodSegments(item('quarterly'),'2026-11')[0].start).toBe('2026-10-01');
  expect(periodSegments(item('quarterly'),'2026-12')[0].start).toBe('2026-10-01');
  expect(periodSegments(item('quarterly'),'2027-01')[0].start).toBe('2027-01-01');
  expect(periodSegments(item('semiannual'),'2026-12')[0].start).toBe('2026-07-01');
  expect(periodSegments(item('annual'),'2026-12')[0].start).toBe('2026-01-01');
 });
 it('clips weekly periods to the visible month without losing the previous-month key',()=>{
  const periods=periodSegments(item('weekly','2026-09-27'),'2026-10');
  expect(periods[0]).toMatchObject({start:'2026-09-27',from:'2026-10-01',to:'2026-10-03',days:3});
  expect(periods.reduce((sum,p)=>sum+p.days,0)).toBe(31);
 });
 it('keeps anchors stable on Sunday, month, quarter and year changes',()=>{
  expect(periodAnchor('weekly','2026-10-29')).toBe('2026-10-25');
  expect(periodAnchor('monthly','2026-10-29')).toBe('2026-10-01');
  expect(periodAnchor('semiannual','2026-10-29')).toBe('2026-07-01');
  expect(periodAnchor('annual','2026-10-29')).toBe('2026-01-01');
 });
 it('uses period end as the completion deadline rather than its first day',()=>{
  expect(calendarPeriodEnd('2026-10-01','monthly')).toBe('2026-10-31');
  expect(calendarPeriodEnd('2026-10-25','weekly')).toBe('2026-10-31');
  expect(calendarPeriodEnd('2026-10-01','quarterly')).toBe('2026-12-31');
 });
 it('honors termination in the middle of a visible month',()=>{
  const periods=periodSegments({...item('monthly'),endDate:'2026-10-12'},'2026-10');
  expect(periods[0]).toMatchObject({to:'2026-10-12',days:12});
  expect(periodSegments({...item('monthly'),endDate:'2026-10-12'},'2026-11')).toHaveLength(0);
 });
});
