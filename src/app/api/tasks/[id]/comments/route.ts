import { api,readBody } from '@/server/http';
import { addComment } from '@/server/service';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) { return api(request,async p=>({comment:await addComment(p,(await params).id,await readBody(request))})); }
