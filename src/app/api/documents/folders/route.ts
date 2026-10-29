import {api,readBody} from "@/server/http";
import {createDocumentFolder} from "@/server/documents";
export async function POST(request:Request){return api(request,async p=>({folder:await createDocumentFolder(p,await readBody(request))}));}
