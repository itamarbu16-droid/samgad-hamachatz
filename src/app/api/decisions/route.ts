import { api,readBody } from '@/server/http';
import { createDecision } from '@/server/service';
export const runtime='nodejs';
export async function POST(request:Request) { return api(request,async p=>({decision:await createDecision(p,await readBody(request))})); }
