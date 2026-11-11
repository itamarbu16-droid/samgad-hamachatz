import {api,readBody} from '@/server/http';
import {scheduleCalendarTask} from '@/server/google-calendar';
export async function POST(request:Request){return api(request,async p=>scheduleCalendarTask(p,await readBody(request)));}
