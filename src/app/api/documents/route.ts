import { api, readBody } from "@/server/http";
import { getDocuments, createDocument } from "@/server/documents";
export async function GET(request: Request) {
  return api(request, getDocuments);
}
export async function POST(request: Request) {
  return api(request, async (p) => ({
    entry: await createDocument(p, await readBody(request, 4_300_000)),
  }));
}
