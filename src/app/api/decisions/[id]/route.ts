import { api,readBody } from '@/server/http';
import { updateDecision } from '@/server/service';
export const runtime='nodejs';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) { return api(request,async p=>({decision:await updateDecision(p,(await params).id,await readBody(request))})); }
