import { addDays, monthEnd, occurrenceDates, type Frequency } from './rhythm';
export type PeriodItem = {startDate:string;endDate:string|null;frequency:Frequency};
export function periodSegments(item:PeriodItem,month:string){
 const first=month+'-01',last=monthEnd(month);
 const starts=occurrenceDates(item.startDate,item.frequency,addDays(last,370),item.endDate);
 return starts.flatMap((start,index)=>{
  let end=starts[index+1]?addDays(starts[index+1],-1):last;
  if(item.endDate&&end>item.endDate)end=item.endDate;
  if(end<first||start>last)return [];
  const from=start<first?first:start,to=end>last?last:end;
  return [{start,end,from,to,days:Math.round((Date.parse(to)-Date.parse(from))/86400000)+1}];
 });
}
export function periodAnchor(frequency:Frequency,today:string){
 const year=today.slice(0,4),month=Number(today.slice(5,7));
 if(frequency==='daily'||frequency==='once')return today;
 if(frequency==='weekly')return addDays(today,-new Date(today+'T12:00:00Z').getUTCDay());
 // A stable Sunday anchor keeps fortnightly periods consistent across years.
 if(frequency==='fortnightly'){const anchor='2026-01-04',days=Math.floor((Date.parse(today)-Date.parse(anchor))/86400000);return addDays(anchor,Math.floor(days/14)*14);}
 const step={monthly:1,quarterly:3,semiannual:6,annual:12}[frequency];
 return `${year}-${String(Math.floor((month-1)/step)*step+1).padStart(2,'0')}-01`;
}

export function calendarPeriodEnd(start:string,frequency:Frequency){
 if(frequency==='once'||frequency==='daily')return start;
 if(frequency==='weekly'||frequency==='fortnightly')return addDays(start,frequency==='weekly'?6:13);
 const months={monthly:1,quarterly:3,semiannual:6,annual:12}[frequency];
 const date=new Date(start+'T12:00:00Z');
 return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+months,0,12)).toISOString().slice(0,10);
}
