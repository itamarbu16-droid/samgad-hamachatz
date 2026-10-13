import { api } from '@/server/http';
import { getWorkspace } from '@/server/service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) { return api(request,getWorkspace); }
