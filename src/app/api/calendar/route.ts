import {api} from '@/server/http';
import {calendarStatus,disconnectCalendar} from '@/server/google-calendar';
export async function GET(request:Request){return api(request,calendarStatus);}
export async function DELETE(request:Request){return api(request,disconnectCalendar);}
