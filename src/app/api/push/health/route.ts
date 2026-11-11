import {api} from '@/server/http';
import {pushHealth} from '@/server/notifications';
export async function GET(request:Request){return api(request,pushHealth);}
