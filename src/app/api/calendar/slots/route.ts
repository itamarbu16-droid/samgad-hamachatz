import {api,readBody} from '@/server/http';
import {calendarSlots} from '@/server/google-calendar';
export async function POST(request:Request){return api(request,async p=>calendarSlots(p,await readBody(request)));}
