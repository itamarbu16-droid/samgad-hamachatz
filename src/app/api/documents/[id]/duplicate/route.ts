import {api,readBody} from '@/server/http';
import {duplicateDocument} from '@/server/documents';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 return api(request,async p=>({entry:await duplicateDocument(p,(await context.params).id,await readBody(request))}));
}
