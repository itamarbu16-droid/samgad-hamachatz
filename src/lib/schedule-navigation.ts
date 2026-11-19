import {addDays} from './rhythm';
export type ScheduleEvent={id:string;title:string;start:string;end:string;allDay:boolean;location:string};
export const calendarDay=(value:Date|string=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export const calendarWeekStart=(day:string)=>addDays(day,-new Date(day+'T12:00:00Z').getUTCDay());
export function calendarDays(day:string,view:'day'|'week'){
 const start=view==='day'?day:calendarWeekStart(day);
 return Array.from({length:view==='day'?1:7},(_,index)=>addDays(start,index));
}
/** Google end dates/times are exclusive; midnight must not leak into the next day. */
export function eventsOnDay(events:ScheduleEvent[],day:string){
 return events.filter(event=>{
  const start=event.allDay?event.start:calendarDay(event.start);
  const last=event.allDay?addDays(event.end,-1):calendarDay(new Date(Math.max(Date.parse(event.start),Date.parse(event.end)-1)));
  return start<=day&&last>=day;
 }).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start.localeCompare(b.start));
}
