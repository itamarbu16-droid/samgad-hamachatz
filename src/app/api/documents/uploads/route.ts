import {api,readBody} from '@/server/http';
import {beginDocumentUpload} from '@/server/document-uploads';
export async function POST(request:Request){return api(request,async p=>beginDocumentUpload(p,await readBody(request)));}
