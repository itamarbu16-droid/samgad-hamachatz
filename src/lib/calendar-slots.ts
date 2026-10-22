import {addDays} from './rhythm';
export type TimeRange={start:string;end:string};
export function zonedTime(date:string,time:string,timeZone='Asia/Jerusalem'){
 const wall=Date.parse(`${date}T${time}:00Z`);let instant=wall;
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let n=0;n<3;n++){
  const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
  const shown=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  const difference=wall-shown;instant+=difference;if(!difference)break;
 }
 return instant;
}
export function findFreeSlots(input:{from:string;through:string;dayStart:string;dayEnd:string;minutes:number;busy:TimeRange[];now?:number;limit?:number}){
 const {from,through,dayStart,dayEnd,minutes,busy}=input;
 if(!Number.isInteger(minutes)||minutes<5||minutes>480||through<from||dayEnd<=dayStart)throw Error('Invalid scheduling window');
 const ranges=busy.map(b=>({start:Date.parse(b.start),end:Date.parse(b.end)})).sort((a,b)=>a.start-b.start);
 if(ranges.some(b=>!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.end<b.start))throw Error('Invalid busy interval');
 const slots:TimeRange[]=[],duration=minutes*60_000,step=15*60_000;
 const now=input.now??Date.now(),limit=input.limit??3;
 for(let day=from;day<=through&&slots.length<limit;day=addDays(day,1)){
  const finish=zonedTime(day,dayEnd);
  let candidate=Math.ceil(Math.max(zonedTime(day,dayStart),now)/step)*step;
  while(candidate+duration<=finish&&slots.length<limit){
   const conflict=ranges.find(b=>b.start<candidate+duration&&b.end>candidate);
   if(conflict){candidate=Math.ceil(conflict.end/step)*step;continue;}
   slots.push({start:new Date(candidate).toISOString(),end:new Date(candidate+duration).toISOString()});candidate+=duration;
  }
 }
 return slots;
}
