import {api,readBody} from '@/server/http';
import {listDeadlineRequests,requestDeadline,resolveDeadline} from '@/server/deadline-requests';
export async function GET(r:Request){return api(r,listDeadlineRequests);}
export async function POST(r:Request){return api(r,async p=>requestDeadline(p,await readBody(r)));}
export async function PATCH(r:Request){return api(r,async p=>resolveDeadline(p,await readBody(r)));}
