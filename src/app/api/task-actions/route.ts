import {api,readBody} from '@/server/http';
import {actOnTask} from '@/server/task-actions';
export async function POST(request:Request){return api(request,async p=>actOnTask(p,await readBody(request)));}
