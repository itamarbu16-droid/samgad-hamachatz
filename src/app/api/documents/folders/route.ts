import {api,readBody} from "@/server/http";
import {createDocumentFolder,updateDocumentFolder,deleteDocumentFolder} from "@/server/documents";
export async function POST(request:Request){return api(request,async p=>({folder:await createDocumentFolder(p,await readBody(request))}));}

export async function PATCH(request:Request){return api(request,async p=>({folder:await updateDocumentFolder(p,await readBody(request))}));}
export async function DELETE(request:Request){return api(request,async p=>deleteDocumentFolder(p,await readBody(request)));}
