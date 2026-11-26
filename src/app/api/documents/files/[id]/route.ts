import { api } from "@/server/http";
import { downloadDocument } from "@/server/documents";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async (p) => {
    const file = await downloadDocument(p, (await context.params).id);
    const preview = new URL(request.url).searchParams.get("preview") === "1"
      && ["application/pdf", "image/png", "image/jpeg"].includes(file.contentType);
    let offset=0;
    const stream=new ReadableStream<Uint8Array>({pull(controller){
      if(offset>=file.bytes.length){controller.close();return;}
      const chunk=file.bytes.subarray(offset,offset+256*1024);offset+=chunk.length;controller.enqueue(chunk);
    }});
    return new Response(stream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="document"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'self'",
        "Referrer-Policy": "no-referrer",
      },
    });
  });
}
