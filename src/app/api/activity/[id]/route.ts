import {api,readBody} from '@/server/http';
import {dismissActivity} from '@/server/service';
export const runtime='nodejs';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  return api(request,async p=>dismissActivity(p,(await params).id,await readBody(request)));
}
