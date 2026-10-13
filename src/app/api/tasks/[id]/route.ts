import { api,readBody } from '@/server/http';
import { updateTask } from '@/server/service';
export const runtime='nodejs';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) { return api(request,async p=>({task:await updateTask(p,(await params).id,await readBody(request))})); }
