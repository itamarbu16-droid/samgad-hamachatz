import { api } from "@/server/http";
import { downloadDocument } from "@/server/documents";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async (p) => {
    const file = await downloadDocument(p, (await context.params).id);
    return new Response(Uint8Array.from(file.bytes).buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
