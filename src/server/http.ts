import {after} from "next/server";
import {flushPush} from "./notifications";
import { ZodError } from "zod";
import { getAuth } from "./auth";
import { AppError, type Principal } from "./policy";
import { principalFor } from "./service";
import { appUrl } from "./app-url";
import { assertDocumentUploadContext, DocumentUploadContextChanged, documentUploadContextChangedCode } from "./document-upload-context";

export async function api(
  request: Request,
  handler: (principal: Principal, sessionId: string) => Promise<unknown>,
  options?: { bindDocumentUpload?: boolean },
) {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const expected = appUrl();
      if (!expected || origin !== expected)
        throw new AppError(403, "הבקשה לא הגיעה מכתובת היישום המאושרת");
      if (!request.headers.get("content-type")?.includes("application/json"))
        throw new AppError(415, "פורמט הבקשה אינו נתמך");
    }
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new AppError(401, "הכניסה למיילים מורשים בלבד. יש להתחבר");
    const principal: Principal = await principalFor(session.user.id, session.user.name);
    const sessionId = session.session.id;
    if (options?.bindDocumentUpload) assertDocumentUploadContext(request.headers, principal, sessionId);
    const result = await handler(principal, sessionId);
    if(!["GET","HEAD"].includes(request.method)&&!new URL(request.url).pathname.startsWith("/api/push"))after(async()=>{try{await flushPush();}catch{console.error("Push delivery deferred");}});
    if (result instanceof Response) return result;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DocumentUploadContextChanged)
      return Response.json({ error: error.message, code: documentUploadContextChangedCode }, { status: error.status });
    if (error instanceof AppError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError)
      return Response.json(
        {
          error: "יש לבדוק את השדות ולהזין פרטים תקינים",
          fields: error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { error: "לא ניתן לקרוא את הבקשה" },
        { status: 400 },
      );
    console.error("Application request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "לא ניתן להשלים את הפעולה כעת. יש לנסות שוב" },
      { status: 503 },
    );
  }
}
export async function readBody(request: Request, maxLength = 20_000) {
  const text = await request.text();
  if (text.length > maxLength) throw new AppError(413, "הבקשה גדולה מדי");
  return JSON.parse(text) as unknown;
}
