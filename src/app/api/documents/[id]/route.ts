import { api, readBody } from "@/server/http";
import { getDocument, updateDocument } from "@/server/documents";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async (p) => ({
    entry: await getDocument(p, (await context.params).id),
  }));
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async (p) => ({
    entry: await updateDocument(
      p,
      (await context.params).id,
      await readBody(request, 4_300_000),
    ),
  }));
}
