import {z} from 'zod';
import {api,readBody} from '@/server/http';
import {sendManualTaskReminder} from '@/server/manual-task-reminders';
import {acknowledgeManualReminder,pendingManualReminder} from '@/server/manual-task-reminder-state';
export async function GET(request:Request){return api(request,p=>pendingManualReminder(p));}
export async function POST(request:Request){return api(request,async p=>sendManualTaskReminder(p,await readBody(request,2048)));}
export async function PATCH(request:Request){return api(request,async p=>{
 const {id}=z.object({id:z.string().min(1).max(1200)}).strict().parse(await readBody(request,1600));
 await acknowledgeManualReminder(p,[id]);return {ok:true};
});}
