import {api,readBody} from '@/server/http';
import {getTrackerTrash,getDocumentTrash,manageDocuments} from '@/server/documents';
export async function GET(request:Request){return api(request,async p=>({entries:await (new URL(request.url).searchParams.has('section')?getDocumentTrash(p,new URL(request.url).searchParams.get('section')!):getTrackerTrash(p))}));}
export async function POST(request:Request){return api(request,async p=>manageDocuments(p,await readBody(request)));}
