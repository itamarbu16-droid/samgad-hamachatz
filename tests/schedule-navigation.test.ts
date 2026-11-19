import {describe,it,expect} from 'vitest';
import {calendarDay,calendarDays,eventsOnDay,type ScheduleEvent} from '../src/lib/schedule-navigation';
const event=(start:string,end:string,allDay=false):ScheduleEvent=>({id:start,title:'אירוע',start,end,allDay,location:''});
describe('calendar navigation',()=>{
 it('uses Jerusalem rather than browser/UTC date',()=>expect(calendarDay('2026-11-11T22:30:00Z')).toBe('2026-11-12'));
 it('opens just the selected day and Sunday-based weeks',()=>{
  expect(calendarDays('2026-11-12','day')).toEqual(['2026-11-12']);
  expect(calendarDays('2026-11-12','week')).toEqual(['2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14']);
 });
 it('handles week/year transitions',()=>expect(calendarDays('2027-01-01','week')[0]).toBe('2026-12-27'));
 it('does not leak exclusive all-day end into tomorrow',()=>{
  const events=[event('2026-11-11','2026-11-13',true)];
  expect(eventsOnDay(events,'2026-11-12')).toHaveLength(1);
  expect(eventsOnDay(events,'2026-11-13')).toHaveLength(0);
 });
 it('includes overnight events but not events ending at midnight',()=>{
  const events=[event('2026-11-11T23:00:00+02:00','2026-11-12T01:00:00+02:00'),event('2026-11-11T22:00:00+02:00','2026-11-12T00:00:00+02:00')];
  expect(eventsOnDay(events,'2026-11-12')).toHaveLength(1);
 });
 it('puts all-day first then chronological events',()=>{
  const late=event('2026-11-12T15:00:00+02:00','2026-11-12T16:00:00+02:00'),early=event('2026-11-12T09:00:00+02:00','2026-11-12T10:00:00+02:00'),all=event('2026-11-12','2026-11-13',true);
  expect(eventsOnDay([late,all,early],'2026-11-12')).toEqual([all,early,late]);
 });
});
