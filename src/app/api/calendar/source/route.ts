import {api,readBody} from '@/server/http';
import {scheduleCalendars,selectScheduleCalendar} from '@/server/google-calendar';
export async function GET(request:Request){return api(request,scheduleCalendars);}
export async function PUT(request:Request){return api(request,async p=>selectScheduleCalendar(p,await readBody(request)));}
