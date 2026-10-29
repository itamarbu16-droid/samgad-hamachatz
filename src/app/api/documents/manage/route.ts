import {api,readBody} from '@/server/http';
import {getTrackerTrash,manageTrackers} from '@/server/documents';
export async function GET(request:Request){return api(request,async p=>({entries:await getTrackerTrash(p)}));}
export async function POST(request:Request){return api(request,async p=>manageTrackers(p,await readBody(request)));}
