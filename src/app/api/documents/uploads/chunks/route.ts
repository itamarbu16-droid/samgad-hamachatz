import {api,readBody} from '@/server/http';
import {putDocumentChunk} from '@/server/document-uploads';
export async function POST(request:Request){return api(request,async p=>putDocumentChunk(p,await readBody(request,1_410_000)));}
