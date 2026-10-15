import { api,readBody } from '@/server/http';
import { getAccess,grantAccess } from '@/server/access';
export async function GET(request:Request){return api(request,getAccess);}
export async function POST(request:Request){return api(request,async p=>grantAccess(p,await readBody(request)));}
