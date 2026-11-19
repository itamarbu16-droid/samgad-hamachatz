import {api} from '@/server/http';
import {workspaceSchedule} from '@/server/google-calendar';
export async function GET(request:Request){return api(request,workspaceSchedule);}
