import { api,readBody } from '@/server/http';
import { createTask } from '@/server/service';
export const runtime='nodejs';
export async function POST(request:Request) { return api(request,async p=>({task:await createTask(p,await readBody(request))})); }
