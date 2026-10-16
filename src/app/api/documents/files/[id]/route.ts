import { api } from "@/server/http";
import { downloadDocument } from "@/server/documents";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async (p) => {
    const file = await downloadDocument(p, (await context.params).id);
    let offset=0;
    const stream=new ReadableStream<Uint8Array>({pull(controller){
      if(offset>=file.bytes.length){controller.close();return;}
      const chunk=file.bytes.subarray(offset,offset+256*1024);offset+=chunk.length;controller.enqueue(chunk);
    }});
    return new Response(stream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
