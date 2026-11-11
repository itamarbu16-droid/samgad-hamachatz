import {api} from '@/server/http';
import {startCalendarConnection} from '@/server/google-calendar';
export async function GET(request:Request){return api(request,startCalendarConnection);}
